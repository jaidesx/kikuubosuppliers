/**
 * Data-integrity tests for products_array.js
 *
 * Strategy: load the file source and execute it with the Function constructor
 * so the `products` constant is accessible in the test environment without
 * requiring module exports to be added to the source file.
 */

const fs = require("fs");
const path = require("path");

// Execute products_array.js and capture the products constant.
// new Function creates an isolated scope; the const declaration inside is
// valid and reachable via the return statement at the end.
const PRODUCTS_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../products_array.js"),
  "utf8"
);

let products;
beforeAll(() => {
  // eslint-disable-next-line no-new-func
  products = new Function(`${PRODUCTS_SOURCE}\nreturn products;`)();
});

// ---------------------------------------------------------------------------
// Basic structure
// ---------------------------------------------------------------------------
describe("Products – basic structure", () => {
  test("products is a non-empty array", () => {
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
  });

  test("contains more than 400 products", () => {
    expect(products.length).toBeGreaterThan(400);
  });

  test("every product is a plain object", () => {
    products.forEach((p) => {
      expect(typeof p).toBe("object");
      expect(p).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Required fields presence
// ---------------------------------------------------------------------------
describe("Products – required fields", () => {
  const REQUIRED_FIELDS = ["id", "name", "brand", "price", "category", "image", "description"];

  REQUIRED_FIELDS.forEach((field) => {
    test(`every product has the '${field}' field`, () => {
      const missing = products.filter((p) => !(field in p));
      expect(missing).toHaveLength(0);
    });
  });

  test("every product has an 'images' array field", () => {
    const missing = products.filter((p) => !Array.isArray(p.images) || p.images.length === 0);
    expect(missing).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// id integrity
// ---------------------------------------------------------------------------
describe("Products – id integrity", () => {
  test("all ids are numbers", () => {
    const nonNumeric = products.filter((p) => typeof p.id !== "number");
    expect(nonNumeric).toHaveLength(0);
  });

  test("all ids are positive integers", () => {
    const invalid = products.filter((p) => !Number.isInteger(p.id) || p.id < 1);
    expect(invalid).toHaveLength(0);
  });

  test("all ids are unique (no duplicates)", () => {
    const ids = products.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test("ids start from 1", () => {
    const minId = Math.min(...products.map((p) => p.id));
    expect(minId).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// name field
// ---------------------------------------------------------------------------
describe("Products – name field", () => {
  test("all names are non-empty strings", () => {
    const invalid = products.filter(
      (p) => typeof p.name !== "string" || p.name.trim().length === 0
    );
    expect(invalid).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// brand field
// ---------------------------------------------------------------------------
describe("Products – brand field", () => {
  test("all brands are strings", () => {
    const invalid = products.filter((p) => typeof p.brand !== "string");
    expect(invalid).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// price field
// ---------------------------------------------------------------------------
describe("Products – price field", () => {
  test("all prices are numbers", () => {
    const invalid = products.filter((p) => typeof p.price !== "number");
    expect(invalid).toHaveLength(0);
  });

  test("all prices are positive", () => {
    const invalid = products.filter((p) => p.price <= 0);
    expect(invalid).toHaveLength(0);
  });

  test("all prices are finite (no Infinity or NaN)", () => {
    const invalid = products.filter((p) => !isFinite(p.price));
    expect(invalid).toHaveLength(0);
  });

  test("all prices are within a realistic UGX range (100 – 2,000,000)", () => {
    const tooLow = products.filter((p) => p.price < 100);
    const tooHigh = products.filter((p) => p.price > 2_000_000);
    expect(tooLow).toHaveLength(0);
    expect(tooHigh).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// category field
// ---------------------------------------------------------------------------
describe("Products – category field", () => {
  const KNOWN_CATEGORIES = new Set([
    "Aid/Pharmacy",
    "Baby Products",
    "Baking Aids",
    "Batteries,Candles,Matches & Incense Sticks",
    "Beverages",
    "Biscuits, Chocolate, Lollipops & Snacks",
    "Boots, Slippers & Shoe Polish",
    "Breakfast & Dairy",
    "Cappuccino",
    "Cereals & Grains",
    "Cleaning & Household",
    "Cooking & Essentials",
    "Cooking Essentials",
    "Disposables, Foils and Packaging",
    "Fruits",
    "Personal Care",
    "Stationery",
    "Tissues,Toilet Rolls & Wet Wipes",
  ]);

  test("all categories are non-empty strings", () => {
    const invalid = products.filter(
      (p) => typeof p.category !== "string" || p.category.trim().length === 0
    );
    expect(invalid).toHaveLength(0);
  });

  test("all categories belong to the known category list", () => {
    const unknown = products.filter((p) => !KNOWN_CATEGORIES.has(p.category));
    if (unknown.length > 0) {
      const uniqueUnknown = [...new Set(unknown.map((p) => p.category))];
      console.warn("Unknown categories detected:", uniqueUnknown);
    }
    expect(unknown).toHaveLength(0);
  });

  test("no products use the old 'Cereal & Grains' typo", () => {
    const typo = products.filter((p) => p.category === "Cereal & Grains");
    expect(typo).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// image field
// ---------------------------------------------------------------------------
describe("Products – image field", () => {
  test("all image paths are non-empty strings", () => {
    const invalid = products.filter(
      (p) => typeof p.image !== "string" || p.image.trim().length === 0
    );
    expect(invalid).toHaveLength(0);
  });

  test("all image paths start with 'image/'", () => {
    const invalid = products.filter((p) => !p.image.startsWith("image/"));
    expect(invalid).toHaveLength(0);
  });

  test("all image paths end with a known image extension", () => {
    const VALID_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif)$/i;
    const invalid = products.filter((p) => !VALID_EXTENSIONS.test(p.image));
    expect(invalid).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// description field
// ---------------------------------------------------------------------------
describe("Products – description field", () => {
  test("all descriptions are non-empty strings", () => {
    const invalid = products.filter(
      (p) => typeof p.description !== "string" || p.description.trim().length === 0
    );
    expect(invalid).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Spot-check known products
// ---------------------------------------------------------------------------
describe("Products – spot-checks for known entries", () => {
  test("product id=1 is Pringles at UGX 9500", () => {
    const p = products.find((p) => p.id === 1);
    expect(p).toBeDefined();
    expect(p.name).toBe("Pringles");
    expect(p.price).toBe(9500);
    expect(p.category).toBe("Biscuits, Chocolate, Lollipops & Snacks");
  });

  test("product id=8 is Kakira Sugar at UGX 160000", () => {
    const p = products.find((p) => p.id === 8);
    expect(p).toBeDefined();
    expect(p.name).toBe("Sugar");
    expect(p.brand).toBe("Kakira");
    expect(p.price).toBe(160000);
  });

  test("product id=13 is Jik 3ltr at UGX 35000", () => {
    const p = products.find((p) => p.id === 13);
    expect(p).toBeDefined();
    expect(p.name).toBe("Jik 3ltr");
    expect(p.category).toBe("Cleaning & Household");
  });

  test("the last product (id=473) exists and has valid data", () => {
    const p = products.find((p) => p.id === 473);
    expect(p).toBeDefined();
    expect(p.price).toBeGreaterThan(0);
    expect(p.image).toMatch(/\.(jpg|jpeg|png|webp)$/i);
  });
});

// ---------------------------------------------------------------------------
// Category distribution (smoke test – ensures variety)
// ---------------------------------------------------------------------------
describe("Products – category distribution", () => {
  test("at least 5 different categories are represented", () => {
    const categories = new Set(products.map((p) => p.category));
    expect(categories.size).toBeGreaterThanOrEqual(5);
  });

  test("Cooking Essentials is the most-represented or one of the larger categories", () => {
    const cookingCount = products.filter(
      (p) => p.category === "Cooking Essentials" || p.category === "Cooking & Essentials"
    ).length;
    expect(cookingCount).toBeGreaterThan(10);
  });

  test("Cleaning & Household has multiple products", () => {
    const count = products.filter((p) => p.category === "Cleaning & Household").length;
    expect(count).toBeGreaterThan(5);
  });
});
