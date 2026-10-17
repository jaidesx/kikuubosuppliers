<?php
declare(strict_types=1);

final class SupplierService
{
    public function __construct(private PDO $pdo) {}

    public function orders(): array
    {
        return $this->pdo->query('SELECT order_reference, customer_name, customer_phone,
            delivery_location, customer_notes, estimated_subtotal_ugx, confirmed_total_ugx,
            order_status, created_at FROM orders ORDER BY id DESC LIMIT 100')->fetchAll();
    }

    public function items(string $reference): array
    {
        $q = $this->pdo->prepare('SELECT i.product_name, i.quantity, i.unit_price_ugx,
            i.line_total_ugx, i.requires_quotation FROM order_items i JOIN orders o ON o.id = i.order_id
            WHERE o.order_reference = ?');
        $q->execute([$reference]);
        return $q->fetchAll();
    }

    public function approve(string $reference, int $amount): void
    {
        if ($amount < 1 || $amount > 999999999999) {
            throw new InvalidArgumentException('Enter a positive whole UGX amount');
        }
        $this->pdo->beginTransaction();
        try {
            $q = $this->pdo->prepare('SELECT id, order_status FROM orders WHERE order_reference = ? FOR UPDATE');
            $q->execute([$reference]);
            $order = $q->fetch();
            if (!$order || !in_array($order['order_status'], ['PENDING_REVIEW', 'AWAITING_PAYMENT'], true)) {
                throw new RuntimeException('Order cannot be approved');
            }
            $accessLock = $this->pdo->prepare('SELECT id FROM order_payment_access WHERE order_id = ? FOR UPDATE');
            $accessLock->execute([$order['id']]);
            $accessLock->fetchAll();
            $q = $this->pdo->prepare("SELECT id FROM payment_transactions WHERE order_id = ?
                AND (status IN ('CREATED', 'PENDING', 'SUCCESSFUL') OR dispatch_state <> 'RESERVED') LIMIT 1 FOR UPDATE");
            $q->execute([$order['id']]);
            if ($q->fetchColumn()) { throw new RuntimeException('Payment activity prevents amount changes'); }
            $this->pdo->prepare('UPDATE order_payment_access SET revoked_at = UTC_TIMESTAMP()
                WHERE order_id = ? AND revoked_at IS NULL')->execute([$order['id']]);
            $this->pdo->prepare("UPDATE orders SET confirmed_total_ugx = ?, order_status = 'AWAITING_PAYMENT'
                WHERE id = ?")->execute([$amount, $order['id']]);
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) { $this->pdo->rollBack(); }
            throw $e;
        }
    }
}
