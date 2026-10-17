<?php
declare(strict_types=1);

require_once __DIR__ . '/OrderItemValidator.php';

final class OrderRequestValidator
{
    public function __construct(
        private OrderItemValidator $itemValidator
    ) {}

    public function validate(array $request): array
    {
        $customer = $request['customer'] ?? null;

        if (!is_array($customer) || array_is_list($customer)) {
            throw new InvalidArgumentException('Invalid customer details');
        }

        $name = $this->text($customer['name'] ?? null, 'Customer name');
        $phone = $this->text($customer['phone'] ?? null, 'Customer phone');
        $location = $this->text($customer['location'] ?? null, 'Delivery location');
        $notes = $this->text($customer['notes'] ?? '', 'Customer notes');

        $nameLength = mb_strlen($name);
        $locationLength = mb_strlen($location);

        if ($nameLength < 2 || $nameLength > 100 ||
            preg_match('/[\x00-\x1F\x7F]/u', $name)) {
            throw new InvalidArgumentException('Invalid customer name');
        }

        $phone = preg_replace('/[\s()-]/', '', $phone);

        if (!preg_match('/^(?:0[37]\d{8}|\+?256[37]\d{8})$/D', $phone)) {
            throw new InvalidArgumentException('Invalid Ugandan mobile number');
        }

        if ($locationLength < 3 || $locationLength > 300 ||
            preg_match('/[\x00-\x1F\x7F]/u', $location)) {
            throw new InvalidArgumentException('Invalid delivery location');
        }

        if (mb_strlen($notes) > 1000 ||
            preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', $notes)) {
            throw new InvalidArgumentException('Invalid customer notes');
        }

        $method = $request['payment_method'] ?? null;

        if (!in_array($method, ['mtn', 'airtel'], true)) {
            throw new InvalidArgumentException('Invalid payment method');
        }

        $items = $request['items'] ?? null;

        if (!is_array($items) || !array_is_list($items)) {
            throw new InvalidArgumentException('Invalid order items');
        }

        $validatedItems = $this->itemValidator->validate($items);

        return [
            'customer_name' => $name,
            'customer_phone' => $phone,
            'delivery_location' => $location,
            'customer_notes' => $notes,
            'preferred_payment_method' => $method,
            ...$validatedItems,
        ];
    }

    private function text(mixed $value, string $field): string
    {
        if (!is_string($value)) {
            throw new InvalidArgumentException("$field must be text");
        }

        return trim($value);
    }
}
