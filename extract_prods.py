
import re
import json

def extract_products(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find all product divs
    # We'll search for <div class="pro" ... > and match until the next <div class="pro" or end of products section
    # Actually, matching a product div and then everything until it's closed (or roughly before the next one)

    products = []
    # Match each <div class="pro" block
    # We look for the data-category and viewProduct(id) in the start tag

    # Let's find all occurrences of <div class="pro" and then parse each one
    starts = [m.start() for m in re.finditer(r'<div\s+class="pro"', content)]

    for i in range(len(starts)):
        start = starts[i]
        end = starts[i+1] if i+1 < len(starts) else content.find('</section>', start)
        block = content[start:end]

        # ID from onclick="viewProduct(XX)"
        id_match = re.search(r'onclick="viewProduct\((\d+)\)"', block)
        if not id_match:
            continue
        p_id = int(id_match.group(1))

        # Category from data-category="XX"
        cat_match = re.search(r'data-category="([^"]+)"', block)
        category = cat_match.group(1) if cat_match else "Unknown"

        # Image
        img_match = re.search(r'<img\s+src="([^"]+)"', block)
        image = img_match.group(1) if img_match else ""

        # Brand (span in .des)
        brand_match = re.search(r'<span>\s*(.*?)\s*(?:<span>|</span>|<|$)', block.split('<div class="des">')[-1] if '<div class="des">' in block else block, re.DOTALL)
        brand = brand_match.group(1).strip() if brand_match else ""
        brand = brand.replace('<span>', '').replace('</span>', '').strip()

        # Name (h5 in .des)
        name_match = re.search(r'<h5>\s*(.*?)\s*</h5>', block, re.DOTALL)
        name = name_match.group(1).strip() if name_match else ""

        # Price (h4 in .des)
        price_match = re.search(r'<h4>\s*(?:UGX\s*)?([\d,]+)\s*</h4>', block)
        price_str = price_match.group(1).replace(',', '') if price_match else "0"
        try:
            price = int(price_str)
        except ValueError:
            price = 0

        description = f"{brand} {name} - Quality product from Kikuubo Suppliers."

        products.append({
            "id": p_id,
            "name": name,
            "brand": brand,
            "price": price,
            "category": category,
            "image": image,
            "images": [re.search(r'Products/(.*?)\.', image).group(1)] if image and 'Products/' in image else [],
            "description": description
        })

    return products

if __name__ == "__main__":
    prods = extract_products('/home/jamie-foxx/Desktop/kikuubo/product.html')
    # Sort by ID
    prods.sort(key=lambda x: x['id'])
    print(json.dumps(prods, indent=2))
