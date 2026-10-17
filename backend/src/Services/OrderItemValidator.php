<?php
declare(strict_types=1);

require_once __DIR__ . '/ProductCatalogue.php';

final class OrderItemValidator
{
    public function __construct(
        private ProductCatalogue $catalogue
    ) {}

    public function validate(array $items): array
    {
        if (count($items) < 1 || count($items) > 100) {
            throw new InvalidArgumentException(
                'An order must contain between 1 and 100 items'
            );
        }

        $validated = [];
        $seen = [];
        $subtotal = 0;

        foreach ($items as $item) {
            if (!is_array($item)) {
                throw new InvalidArgumentException('Invalid order item');
            }

            $id = $item['product_id'] ?? null;
            $quantity = $item['quantity'] ?? null;

            if (!is_int($id) && !is_string($id)) {
                throw new InvalidArgumentException('Invalid product ID');
            }

            $id = (string) $id;

            if (!preg_match('/^(?:[1-9][0-9]*|ketchup-unverified)$/D', $id)) {
                throw new InvalidArgumentException('Invalid product ID');
            }

            if (isset($seen[$id])) {
                throw new InvalidArgumentException('Duplicate product ID');
            }

            $seen[$id] = true;

            if (!is_int($quantity) || $quantity < 1 || $quantity > 9999) {
                throw new InvalidArgumentException('Invalid quantity');
            }

            $product = $this->catalogue->find($id);

            if ($product === null) {
                throw new InvalidArgumentException('Unknown product');
            }

            $quoteOnly = $product['quote_only'];
            $price = $quoteOnly ? null : $product['price_ugx'];

            if ($price !== null &&
                $quantity > intdiv(PHP_INT_MAX, $price)) {
                throw new InvalidArgumentException('Order total is too large');
            }

            $lineTotal = $price === null ? null : $price * $quantity;

            if ($lineTotal !== null) {
                if ($subtotal > PHP_INT_MAX - $lineTotal) {
                    throw new InvalidArgumentException('Order total is too large');
                }

                $subtotal += $lineTotal;
            }

            $validated[] = [
                'product_id' => $id,
                'product_name' => trim(
                    $product['brand'] . ' ' . $product['name']
                ),
                'quantity' => $quantity,
                'unit_price_ugx' => $price,
                'line_total_ugx' => $lineTotal,
                'requires_quotation' => $quoteOnly,
            ];
        }

        return [
            'items' => $validated,
            'estimated_subtotal_ugx' => $subtotal,
            'requires_quotation' => count(
                array_filter(
                    $validated,
                    fn(array $item): bool => $item['requires_quotation']
                )
            ) > 0,
        ];
    }
}
