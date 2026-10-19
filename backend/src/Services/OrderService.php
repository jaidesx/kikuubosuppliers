<?php
declare(strict_types=1);

require_once __DIR__ . '/IdempotencyConflictException.php';

final class OrderService
{
    public function __construct(private PDO $pdo) {}

    public function create(array $order, string $key): array
    {
        $hash = hash('sha256', json_encode(
            $order,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE
        ));

        $this->pdo->beginTransaction();

        try {
            $existing = $this->findByKey($key);

            if ($existing !== null) {
                if (!hash_equals((string) $existing['request_hash'], $hash)) {
                    throw new IdempotencyConflictException(
                        'Idempotency key already used for another request'
                    );
                }

                $this->pdo->commit();

                return $this->response($existing, true);
            }

            $reference = 'KKS-' . strtoupper(bin2hex(random_bytes(8)));

            $statement = $this->pdo->prepare(
                'INSERT INTO orders (
                    order_reference,
                    customer_name,
                    customer_phone,
                    delivery_location,
                    preferred_payment_method,
                    customer_notes,
                    estimated_subtotal_ugx,
                    order_status,
                    idempotency_key,
                    request_hash
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );

            $statement->execute([
                $reference,
                $order['customer_name'],
                $order['customer_phone'],
                $order['delivery_location'],
                $order['preferred_payment_method'],
                $order['customer_notes'],
                $order['estimated_subtotal_ugx'],
                'PENDING_REVIEW',
                $key,
                $hash,
            ]);

            $orderId = (int) $this->pdo->lastInsertId();

            $itemStatement = $this->pdo->prepare(
                'INSERT INTO order_items (
                    order_id,
                    product_id,
                    product_name,
                    quantity,
                    unit_price_ugx,
                    line_total_ugx,
                    requires_quotation
                ) VALUES (?, ?, ?, ?, ?, ?, ?)'
            );

            foreach ($order['items'] as $item) {
                $itemStatement->execute([
                    $orderId,
                    $item['product_id'],
                    $item['product_name'],
                    $item['quantity'],
                    $item['unit_price_ugx'],
                    $item['line_total_ugx'],
                    $item['requires_quotation'] ? 1 : 0,
                ]);
            }

            $this->pdo->commit();

            return [
                'order_reference' => $reference,
                'order_status' => 'PENDING_REVIEW',
                'estimated_subtotal_ugx' => $order['estimated_subtotal_ugx'],
                'requires_quotation' => $order['requires_quotation'],
                'replayed' => false,
                'payment_status' => 'NOT_INITIATED',
            ];
        } catch (PDOException $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }

            // A simultaneous request may have inserted the same key.
            if ($exception->getCode() === '23000') {
                $existing = $this->findByKey($key);

                if ($existing !== null) {
                    if (!hash_equals((string) $existing['request_hash'], $hash)) {
                        throw new IdempotencyConflictException(
                            'Idempotency key already used for another request'
                        );
                    }

                    return $this->response($existing, true);
                }
            }

            throw $exception;
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }

            throw $exception;
        }
    }

    private function findByKey(string $key): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT order_reference, order_status,
                    estimated_subtotal_ugx, request_hash,
                    EXISTS (
                        SELECT 1 FROM order_items
                        WHERE order_items.order_id = orders.id
                          AND requires_quotation = 1
                    ) AS requires_quotation
             FROM orders WHERE idempotency_key = ?'
        );

        $statement->execute([$key]);

        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    private function response(array $row, bool $replayed): array
    {
        return [
            'order_reference' => $row['order_reference'],
            'order_status' => $row['order_status'],
            'estimated_subtotal_ugx' => (int) $row['estimated_subtotal_ugx'],
            'requires_quotation' => (bool) $row['requires_quotation'],
            'replayed' => $replayed,
            'payment_status' => 'NOT_INITIATED',
        ];
    }
}
