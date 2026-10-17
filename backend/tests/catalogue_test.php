<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/Services/OrderItemValidator.php';

$catalogue = new ProductCatalogue(
    __DIR__ . '/../data/catalogue.json'
);

$validator = new OrderItemValidator($catalogue);

assert($catalogue->count() === 474);

$result = $validator->validate([
    ['product_id' => 1, 'quantity' => 2],
    ['product_id' => 25, 'quantity' => 1],
    ['product_id' => 'ketchup-unverified', 'quantity' => 1],
]);

if ($result['estimated_subtotal_ugx'] !== 19000 ||
    !$result['requires_quotation'] ||
    $result['items'][1]['unit_price_ugx'] !== null ||
    $result['items'][2]['unit_price_ugx'] !== null) {
    throw new RuntimeException('Catalogue validation test failed');
}

$invalidCases = [
    [['product_id' => 999999, 'quantity' => 1]],
    [['product_id' => 1, 'quantity' => 0]],
    [['product_id' => 1, 'quantity' => 10000]],
    [
        ['product_id' => 1, 'quantity' => 1],
        ['product_id' => 1, 'quantity' => 2],
    ],
];

foreach ($invalidCases as $items) {
    try {
        $validator->validate($items);
    } catch (InvalidArgumentException) {
        continue;
    }

    throw new RuntimeException('Invalid order was accepted');
}

echo "Catalogue entries: {$catalogue->count()}\n";
echo "Estimated subtotal: UGX {$result['estimated_subtotal_ugx']}\n";
echo "Quotation required: yes\n";
echo "Invalid order tests: passed\n";
