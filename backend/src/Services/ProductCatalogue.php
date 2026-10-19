<?php
declare(strict_types=1);

final class ProductCatalogue
{
    private array $products = [];

    public function __construct(string $cataloguePath)
    {
        if (!is_readable($cataloguePath)) {
            throw new RuntimeException('Product catalogue unavailable');
        }

        $contents = file_get_contents($cataloguePath);

        if ($contents === false) {
            throw new RuntimeException('Unable to read product catalogue');
        }

        $entries = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);

        if (!is_array($entries) || !array_is_list($entries)) {
            throw new RuntimeException('Invalid product catalogue');
        }

        foreach ($entries as $product) {
            if (!is_array($product) ||
                !isset($product['id'], $product['name'], $product['brand']) ||
                !is_string($product['id']) ||
                !is_string($product['name']) ||
                !is_string($product['brand']) ||
                !isset($product['quote_only']) ||
                !is_bool($product['quote_only'])) {
                throw new RuntimeException('Invalid product entry');
            }

            $id = $product['id'];

            if ($id === '' || isset($this->products[$id])) {
                throw new RuntimeException('Duplicate or empty product ID');
            }

            $price = $product['price_ugx'] ?? null;

            if (!$product['quote_only'] &&
                (!is_int($price) || $price <= 0)) {
                throw new RuntimeException('Invalid catalogue price');
            }

            if ($product['quote_only'] && $price !== null) {
                throw new RuntimeException('Quotation product has a price');
            }

            $this->products[$id] = $product;
        }
    }

    public function find(string $id): ?array
    {
        return $this->products[$id] ?? null;
    }

    public function count(): int
    {
        return count($this->products);
    }
}
