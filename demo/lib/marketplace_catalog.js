/**
 * AISLE Marketplace Catalog - 12 stores, 120+ products
 * Programmatic generation keeps seed maintainable at scale.
 */

const KEYS = {
  razorpay_key_id: process.env.RAZORPAY_KEY_ID,
  razorpay_key_secret: process.env.RAZORPAY_KEY_SECRET,
};

function product(sku, name, description, price_inr, categories, tags, attributes = {}, in_stock = true) {
  return {
    sku,
    data: {
      name,
      description,
      price_inr,
      inventory: Math.floor(Math.random() * 80) + 10,
      categories,
      attributes,
      tags,
    },
    in_stock,
  };
}

function generateCatalog(prefix, items) {
  return items.map(([slug, name, desc, price, cats, tags, attrs]) =>
    product(`${prefix}-${slug}`, name, desc, price, cats, tags, attrs ?? {})
  );
}

// ─── Flagship hand-curated stores (rich metadata for demos) ───────────────

const GADGETNEST = {
  ...KEYS,
  store_name: 'GadgetNest',
  description: 'Electronics and travel accessories for the modern traveller',
  policies: { max_order_value: 15000, human_review_above: 5000, discount_cap_percent: 10, daily_ai_gmv_cap: 50000 },
  catalog: generateCatalog('GN', [
    ['WIFI-JIOFI', 'JioFi 4G Portable WiFi', '150Mbps, 10 devices, 6hr battery. Perfect for travel.', 2499, ['electronics', 'travel', 'connectivity'], ['wifi', '4g', 'travel'], { battery_hours: 6 }],
    ['WIFI-MI-5G', 'Mi 5G WiFi Router Pro', '5G capable, 32 devices, 8hr battery. Premium option.', 4999, ['electronics', 'travel', 'connectivity'], ['wifi', '5g', 'premium'], { battery_hours: 8 }],
    ['POWERBANK-20K', 'Anker PowerCore 20000mAh', 'Dual USB-A + USB-C fast charge power bank.', 2199, ['electronics', 'travel', 'accessories'], ['powerbank', 'anker'], { capacity_mah: 20000 }],
    ['ADAPTER-UNIV', 'Universal Travel Adapter', '150+ countries, 4 USB + 1 USB-C.', 999, ['travel', 'accessories', 'electronics'], ['adapter', 'travel'], { countries: 150 }],
    ['EARBUDS-BOAT', 'boAt Airdopes 441 TWS', 'True wireless, 6hr playback, IPX5.', 1799, ['electronics', 'audio'], ['earbuds', 'audio', 'tws'], { playback_hours: 6 }],
    ['WATCH-FITBIT', 'Fitbit Inspire 3 Tracker', 'Heart rate, sleep, 10-day battery.', 3999, ['electronics', 'fitness', 'wearables'], ['fitness', 'watch'], { battery_days: 10 }],
    ['SPEAKER-JBL', 'JBL Go 3 Speaker', 'IP67 waterproof Bluetooth speaker.', 2499, ['electronics', 'audio'], ['speaker', 'bluetooth'], { playback_hours: 5 }],
    ['KEYBOARD-K380', 'Logitech K380 Bluetooth Keyboard', 'Multi-device, compact, 2yr battery.', 2999, ['electronics', 'office'], ['keyboard', 'bluetooth', 'office'], { layout: 'Compact' }],
    ['MOUSE-MX', 'Logitech MX Master 3S', 'Ergonomic wireless mouse, 70-day battery.', 6499, ['electronics', 'office'], ['mouse', 'wireless', 'office'], { dpi: 8000 }],
    ['TABLET-STAND', 'Aluminium Tablet Stand', 'Adjustable height, fits 10–15" devices.', 1299, ['electronics', 'office', 'accessories'], ['stand', 'tablet', 'desk'], { material: 'Aluminium' }],
  ]),
};

const TRAVELESSENTIALS = {
  ...KEYS,
  store_name: 'TravelEssentials',
  description: 'Curated travel gear for every kind of trip',
  policies: { max_order_value: 10000, human_review_above: 3000, discount_cap_percent: 5, daily_ai_gmv_cap: 30000 },
  catalog: generateCatalog('TE', [
    ['PILLOW-NECK', 'Memory Foam Neck Pillow', '360° support, washable cover.', 699, ['travel', 'comfort'], ['pillow', 'flight', 'comfort'], {}],
    ['LOCK-TSA', 'TSA-Approved Luggage Lock', 'Combination lock for all luggage.', 349, ['travel', 'security'], ['lock', 'tsa', 'luggage'], {}],
    ['CUBES-6PC', '6-Piece Packing Cube Set', 'Lightweight nylon cubes, 3 sizes.', 1299, ['travel', 'organisation'], ['packing', 'cubes', 'luggage'], { pieces: 6 }],
    ['BOTTLE-COLL', 'Collapsible Water Bottle 750ml', 'Silicone fold-flat, BPA-free.', 449, ['travel', 'essentials'], ['bottle', 'collapsible'], { capacity_ml: 750 }],
    ['MASK-SLEEP', '3D Contoured Sleep Mask', 'Zero eye pressure, blocks light fully.', 599, ['travel', 'comfort'], ['sleep', 'mask', 'flight'], {}],
    ['TAG-LUGGAGE', 'Smart Luggage Tag Set (3pc)', 'QR code recovery, leather finish.', 399, ['travel', 'accessories'], ['luggage', 'tag'], { pieces: 3 }],
    ['POUCH-TOILETRY', 'Hanging Toiletry Bag', 'Water-resistant, 8 compartments, hook.', 849, ['travel', 'organisation'], ['toiletry', 'bag'], {}],
    ['BLANKET-TRAVEL', 'Compact Travel Blanket', 'Fleece, packs into pouch, machine washable.', 999, ['travel', 'comfort'], ['blanket', 'flight'], {}],
    ['ADAPTER-EU', 'EU/US/UK Plug Adapter Kit', '3-piece adapter set for international travel.', 549, ['travel', 'accessories'], ['adapter', 'international'], {}],
    ['EYE-MASK-GEL', 'Cooling Gel Eye Mask', 'Relieves puffiness on long flights.', 449, ['travel', 'comfort'], ['eye mask', 'gel'], {}],
  ]),
};

const CONNECTHUB = {
  ...KEYS,
  store_name: 'ConnectHub',
  description: 'Budget connectivity gear for reliable 4G on the go',
  policies: { max_order_value: 8000, human_review_above: 2500, discount_cap_percent: 8, daily_ai_gmv_cap: 25000 },
  catalog: generateCatalog('CH', [
    ['WIFI-BUDGET', 'Budget 4G Hotspot', '100Mbps, 5 devices, 3hr battery - cheapest WiFi.', 1899, ['electronics', 'connectivity'], ['wifi', 'budget', '4g'], { battery_hours: 3 }],
    ['SIM-PREPAID', 'Travel Prepaid SIM 20GB', '30-day validity, multi-carrier India.', 499, ['travel', 'connectivity'], ['sim', 'data', 'prepaid'], { data_gb: 20 }],
    ['CABLE-USBC', 'USB-C Braided Cable 2m', 'Fast-charge nylon braided cable.', 349, ['electronics', 'accessories'], ['cable', 'usb-c'], { length_m: 2 }],
    ['WIFI-PRO', 'Pocket 4G Pro Hotspot', '200Mbps, 8 devices, 5hr battery.', 2799, ['electronics', 'connectivity'], ['wifi', '4g', 'pro'], { battery_hours: 5 }],
    ['SIM-ESIM', 'eSIM Global Data 5GB', 'Instant activation, 15 countries.', 799, ['travel', 'connectivity'], ['esim', 'data', 'global'], { data_gb: 5 }],
    ['HUB-USB-4PORT', 'USB 3.0 Hub 4-Port', 'Compact hub for laptop travel setups.', 699, ['electronics', 'accessories'], ['hub', 'usb'], { ports: 4 }],
    ['ANTENNA-4G', 'External 4G Antenna', 'Boosts signal in low-coverage areas.', 1199, ['electronics', 'connectivity'], ['antenna', '4g'], {}],
    ['ROUTER-MINI', 'Mini Travel Router', 'Repeater + hotspot bridge mode.', 1599, ['electronics', 'connectivity'], ['router', 'travel'], {}],
  ]),
};

const HOMEBASICS = {
  ...KEYS,
  store_name: 'HomeBasics',
  description: 'Everyday home, kitchen, and desk essentials',
  policies: { max_order_value: 12000, human_review_above: 4000, discount_cap_percent: 7, daily_ai_gmv_cap: 40000 },
  catalog: generateCatalog('HB', [
    ['LAMP-DESK', 'LED Desk Lamp USB', '3 colour modes, adjustable brightness.', 1299, ['home', 'office', 'lighting'], ['lamp', 'desk', 'led'], {}],
    ['MUG-THERMAL', 'Thermal Mug 350ml', 'Hot 6hr / cold 12hr, leak-proof.', 799, ['home', 'kitchen'], ['mug', 'thermal'], {}],
    ['ORG-BAMBOO', 'Bamboo Desk Organizer', 'Phone stand, pen holder, drawer.', 899, ['home', 'office'], ['organizer', 'bamboo'], {}],
    ['KETTLE-1L', 'Electric Kettle 1L', '1500W fast boil, glass body.', 1499, ['home', 'kitchen'], ['kettle', 'kitchen'], {}],
    ['CUSHION-SEAT', 'Memory Foam Seat Cushion', 'Coccyx relief for office chair.', 1099, ['home', 'comfort'], ['cushion', 'office'], {}],
    ['POT-PLANT', 'Self-Watering Planter 2pc', 'Ceramic pots with water reservoir.', 649, ['home', 'decor'], ['plant', 'pot'], {}],
    ['SHELF-FLOAT', 'Floating Wall Shelf Set', 'Minimal oak finish, 2 shelves.', 1899, ['home', 'decor'], ['shelf', 'wall'], {}],
    ['BIN-KITCHEN', 'Sensor Kitchen Bin 12L', 'Touchless lid, stainless steel.', 2499, ['home', 'kitchen'], ['bin', 'kitchen'], {}],
    ['MIRROR-LED', 'LED Bathroom Mirror', 'Anti-fog, dimmable, 60cm round.', 3499, ['home', 'bathroom'], ['mirror', 'led'], {}],
    ['RUG-ENTRY', 'Entryway Jute Rug 90x60', 'Natural fibre, non-slip backing.', 1299, ['home', 'decor'], ['rug', 'jute'], {}],
  ]),
};

const STYLELANE = {
  ...KEYS,
  store_name: 'StyleLane',
  description: 'Bags, accessories, and everyday fashion',
  policies: { max_order_value: 8000, human_review_above: 3500, discount_cap_percent: 12, daily_ai_gmv_cap: 35000 },
  catalog: generateCatalog('SL', [
    ['TOTE-CANVAS', 'Canvas Tote - Work Edition', 'Laptop sleeve 14", zip pocket.', 899, ['fashion', 'bags'], ['tote', 'canvas', 'work'], {}],
    ['WALLET-RFID', 'RFID Slim Wallet', '8 cards, genuine leather.', 1199, ['fashion', 'accessories'], ['wallet', 'rfid'], {}],
    ['SUNGLASSES-POL', 'Polarized UV400 Sunglasses', 'Acetate frame + hard case.', 1499, ['fashion', 'eyewear'], ['sunglasses', 'polarized'], {}],
    ['SCARF-PASH', 'Pashmina Wrap Scarf', 'Lightweight blend, 180×70cm.', 749, ['fashion', 'accessories'], ['scarf', 'pashmina'], {}],
    ['BELT-LEATHER', 'Casual Leather Belt', 'Reversible black/brown.', 999, ['fashion', 'accessories'], ['belt', 'leather'], {}],
    ['BACKPACK-DAY', 'Daypack 20L', 'Water-resistant, laptop compartment.', 1999, ['fashion', 'bags'], ['backpack', 'daypack'], {}],
    ['CAP-UNISEX', 'Cotton Baseball Cap', 'Adjustable strap, embroidered logo.', 499, ['fashion', 'accessories'], ['cap', 'hat'], {}],
    ['SOCKS-PACK6', 'Premium Cotton Socks 6-Pack', 'Breathable, assorted colours.', 599, ['fashion', 'accessories'], ['socks', 'cotton'], {}],
    ['WATCH-CLASSIC', 'Minimalist Analog Watch', 'Japanese quartz, leather strap.', 2499, ['fashion', 'accessories'], ['watch', 'analog'], {}],
    ['CARD-HOLDER', 'Card Holder with Money Clip', 'Slim profile, 6 card slots.', 849, ['fashion', 'accessories'], ['card holder'], {}],
  ]),
};

const FITZONE = {
  ...KEYS,
  store_name: 'FitZone',
  description: 'Fitness gear, yoga, and home workout essentials',
  policies: { max_order_value: 15000, human_review_above: 5000, discount_cap_percent: 6, daily_ai_gmv_cap: 45000 },
  catalog: generateCatalog('FZ', [
    ['MAT-YOGA', 'Non-Slip Yoga Mat 6mm', 'TPE eco mat with carry strap.', 1299, ['fitness', 'yoga'], ['yoga', 'mat'], {}],
    ['DUMB-24KG', 'Adjustable Dumbbell 24kg', 'Quick-adjust, replaces 12 sets.', 4999, ['fitness', 'strength'], ['dumbbell', 'weights'], {}],
    ['SHAKER-700', 'Protein Shaker 700ml', 'BPA-free, mixing ball included.', 399, ['fitness', 'nutrition'], ['shaker', 'protein'], {}],
    ['BANDS-5PC', 'Resistance Bands Set', '5 levels + door anchor.', 899, ['fitness', 'strength'], ['resistance', 'bands'], {}],
    ['ROPE-SPEED', 'Speed Jump Rope Cable', 'Ball-bearing handles, adjustable.', 549, ['fitness', 'cardio'], ['jump rope', 'cardio'], {}],
    ['GLOVES-GYM', 'Workout Gloves', 'Padded palm, wrist wrap support.', 699, ['fitness', 'accessories'], ['gloves', 'gym'], {}],
    ['FOAM-ROLLER', 'High-Density Foam Roller', '33cm muscle recovery roller.', 999, ['fitness', 'recovery'], ['foam roller'], {}],
    ['BOTTLE-1L', 'Insulated Gym Bottle 1L', 'Keeps cold 24hr, flip straw.', 649, ['fitness', 'accessories'], ['bottle', 'gym'], {}],
    ['KETTLEBELL-8', 'Cast Iron Kettlebell 8kg', 'Wide handle, flat base.', 2199, ['fitness', 'strength'], ['kettlebell'], {}],
    ['PULLUP-BAR', 'Doorway Pull-Up Bar', 'No-screw install, 100kg capacity.', 1599, ['fitness', 'strength'], ['pull up', 'bar'], {}],
  ]),
};

// ─── Generated vertical stores (8 more × 10 products = 80) ─────────────────

const BOOKNOOK = {
  ...KEYS,
  store_name: 'BookNook',
  description: 'Books, journals, and stationery for readers and creators',
  policies: { max_order_value: 5000, human_review_above: 2000, discount_cap_percent: 5, daily_ai_gmv_cap: 20000 },
  catalog: generateCatalog('BN', [
    ['BOOK-ATOMIC', 'Atomic Habits - Paperback', 'James Clear. Build better habits.', 399, ['books', 'self-help'], ['book', 'habits'], {}],
    ['BOOK-SAPIENS', 'Sapiens - Yuval Noah Harari', 'Brief history of humankind.', 499, ['books', 'history'], ['book', 'history'], {}],
    ['BOOK-PSYCH', 'Thinking, Fast and Slow', 'Daniel Kahneman. Decision-making classic.', 549, ['books', 'psychology'], ['book', 'psychology'], {}],
    ['JOURNAL-DOT', 'Dot Grid Journal A5', '160 pages, hardcover, ribbon marker.', 449, ['stationery', 'office'], ['journal', 'notebook'], {}],
    ['PEN-GEL-3PC', 'Gel Pen Set 3-Pack', '0.5mm, smooth ink, assorted colours.', 199, ['stationery', 'office'], ['pen', 'gel'], {}],
    ['BOOK-DEEP', 'Deep Work - Cal Newport', 'Rules for focused success.', 429, ['books', 'productivity'], ['book', 'productivity'], {}],
    ['MARKERS-HIGH', 'Highlighter Set 6-Colour', 'Chisel tip, no bleed-through.', 249, ['stationery', 'office'], ['highlighter'], {}],
    ['BOOK-FICTION', 'The Midnight Library', 'Matt Haig. Bestselling fiction.', 399, ['books', 'fiction'], ['book', 'fiction'], {}],
    ['STAND-BOOK', 'Adjustable Book Stand', 'Metal holder for reading/cooking.', 599, ['stationery', 'home'], ['book stand'], {}],
    ['BOOK-INDIA', 'The Argumentative Indian', 'Amartya Sen. Indian culture & identity.', 479, ['books', 'culture'], ['book', 'india'], {}],
  ]),
};

const TECHVAULT = {
  ...KEYS,
  store_name: 'TechVault',
  description: 'Premium laptops, monitors, and pro peripherals',
  policies: { max_order_value: 200000, human_review_above: 50000, discount_cap_percent: 3, daily_ai_gmv_cap: 500000 },
  catalog: generateCatalog('TV', [
    ['MON-27-4K', '27" 4K IPS Monitor', '99% sRGB, USB-C 65W, height adjust.', 24999, ['electronics', 'office'], ['monitor', '4k'], {}],
    ['LAP-STAND-ALU', 'Aluminium Laptop Stand', 'Ergonomic tilt, cable management.', 1899, ['electronics', 'office'], ['laptop stand'], {}],
    ['WEBCAM-4K', '4K Webcam with Ring Light', 'Auto-focus, noise-cancelling mic.', 5999, ['electronics', 'office'], ['webcam', '4k'], {}],
    ['SSD-1TB-NVME', '1TB NVMe SSD Gen4', '7000MB/s read, heatsink included.', 6499, ['electronics', 'computing'], ['ssd', 'storage'], {}],
    ['HUB-THUNDER', 'Thunderbolt 4 Dock', 'Dual 4K display, 90W charging.', 12999, ['electronics', 'office'], ['dock', 'thunderbolt'], {}],
    ['KEY-MECH-TKL', 'Mechanical Keyboard TKL', 'Hot-swap switches, RGB backlight.', 7499, ['electronics', 'office'], ['keyboard', 'mechanical'], {}],
    ['PAD-XXL', 'XXL Desk Mat', '900×400mm, stitched edges, non-slip.', 1299, ['electronics', 'office'], ['desk mat'], {}],
    ['HEADSET-ANC', 'Wireless ANC Headset', '40hr battery, dual device connect.', 8999, ['electronics', 'audio'], ['headset', 'anc'], {}],
    ['RAM-32GB', '32GB DDR5 RAM Kit', '5600MHz, CL36, dual channel.', 9999, ['electronics', 'computing'], ['ram', 'memory'], {}],
    ['COOLER-LAP', 'Laptop Cooling Pad', 'Dual fans, 5 height levels, USB powered.', 1499, ['electronics', 'computing'], ['cooler', 'laptop'], {}],
  ]),
};

const BEAUTYBAR = {
  ...KEYS,
  store_name: 'BeautyBar',
  description: 'Skincare, grooming, and personal care',
  policies: { max_order_value: 8000, human_review_above: 3000, discount_cap_percent: 10, daily_ai_gmv_cap: 30000 },
  catalog: generateCatalog('BB', [
    ['SERUM-VITC', 'Vitamin C Brightening Serum 30ml', '10% Vit C, hyaluronic acid.', 899, ['beauty', 'skincare'], ['serum', 'vitamin c'], {}],
    ['MOIST-DAILY', 'Daily Moisturizer SPF 30', 'Lightweight, non-greasy, 50ml.', 649, ['beauty', 'skincare'], ['moisturizer', 'spf'], {}],
    ['CLEANSER-GEL', 'Gentle Gel Cleanser 150ml', 'pH balanced, removes makeup.', 499, ['beauty', 'skincare'], ['cleanser'], {}],
    ['SUNSCREEN-50', 'Sunscreen SPF 50 PA++++', 'Matte finish, no white cast, 50ml.', 749, ['beauty', 'skincare'], ['sunscreen'], {}],
    ['TRIMMER-BEARD', 'Cordless Beard Trimmer', '5 length settings, 60min runtime.', 1499, ['beauty', 'grooming'], ['trimmer', 'beard'], {}],
    ['LIP-BALM-3', 'Hydrating Lip Balm 3-Pack', 'SPF 15, shea butter formula.', 299, ['beauty', 'skincare'], ['lip balm'], {}],
    ['SHAMPOO-SULF', 'Sulfate-Free Shampoo 300ml', 'Keratin repair, colour-safe.', 549, ['beauty', 'haircare'], ['shampoo'], {}],
    ['MASK-SHEET-5', 'Sheet Mask Variety 5-Pack', 'Hydrating, brightening, calming.', 399, ['beauty', 'skincare'], ['sheet mask'], {}],
    ['PERFUME-50', 'Eau de Parfum 50ml', 'Floral woody notes, long lasting.', 2499, ['beauty', 'fragrance'], ['perfume'], {}],
    ['BRUSH-FACE', 'Silicone Face Cleansing Brush', 'Sonic pulses, waterproof.', 999, ['beauty', 'skincare'], ['face brush'], {}],
  ]),
};

const PETPALS = {
  ...KEYS,
  store_name: 'PetPals',
  description: 'Food, toys, and care for dogs and cats',
  policies: { max_order_value: 10000, human_review_above: 4000, discount_cap_percent: 8, daily_ai_gmv_cap: 35000 },
  catalog: generateCatalog('PP', [
    ['FOOD-DOG-3KG', 'Premium Dog Food 3kg', 'Grain-free chicken recipe.', 1299, ['pets', 'food'], ['dog food'], {}],
    ['FOOD-CAT-2KG', 'Indoor Cat Food 2kg', 'Hairball control formula.', 899, ['pets', 'food'], ['cat food'], {}],
    ['TOY-CHEW', 'Durable Chew Toy', 'Natural rubber, dental ridges.', 449, ['pets', 'toys'], ['dog toy', 'chew'], {}],
    ['BED-DOG-M', 'Orthopedic Dog Bed Medium', 'Memory foam, washable cover.', 2499, ['pets', 'comfort'], ['dog bed'], {}],
    ['LITTER-5KG', 'Clumping Cat Litter 5kg', 'Low dust, odour control.', 599, ['pets', 'care'], ['cat litter'], {}],
    ['LEASH-RETRACT', 'Retractable Leash 5m', 'One-button brake, ergonomic grip.', 799, ['pets', 'accessories'], ['leash', 'dog'], {}],
    ['BOWL-SET-2', 'Stainless Steel Bowl Set', 'Non-slip base, 2 sizes.', 649, ['pets', 'accessories'], ['bowl', 'pet'], {}],
    ['GROOM-BRUSH', 'Deshedding Brush', 'Removes loose fur, gentle pins.', 549, ['pets', 'grooming'], ['brush', 'grooming'], {}],
    ['TREAT-DENTAL', 'Dental Chew Treats 12-Pack', 'Reduces tartar, chicken flavour.', 399, ['pets', 'food'], ['treats', 'dental'], {}],
    ['CARRIER-CAT', 'Soft-Side Cat Carrier', 'Airline approved, mesh windows.', 1899, ['pets', 'travel'], ['carrier', 'cat'], {}],
  ]),
};

const GREENSPOON = {
  ...KEYS,
  store_name: 'GreenSpoon',
  description: 'Organic snacks, pantry staples, and health foods',
  policies: { max_order_value: 6000, human_review_above: 2500, discount_cap_percent: 5, daily_ai_gmv_cap: 25000 },
  catalog: generateCatalog('GS', [
    ['GRANOLA-ORG', 'Organic Granola 500g', 'Oats, almonds, honey, no palm oil.', 449, ['food', 'organic'], ['granola', 'breakfast'], {}],
    ['TEA-GREEN-50', 'Green Tea Bags 50-Pack', 'Single-origin Darjeeling.', 349, ['food', 'beverages'], ['tea', 'green'], {}],
    ['NUTS-MIX-500', 'Roasted Nut Mix 500g', 'Almonds, cashews, walnuts, lightly salted.', 599, ['food', 'snacks'], ['nuts', 'snacks'], {}],
    ['HONEY-RAW', 'Raw Wildflower Honey 500g', 'Unprocessed, glass jar.', 499, ['food', 'organic'], ['honey', 'organic'], {}],
    ['OATS-STEEL', 'Steel-Cut Oats 1kg', 'High fibre, slow-release energy.', 299, ['food', 'pantry'], ['oats', 'breakfast'], {}],
    ['PROTEIN-BAR-6', 'Protein Bar Box 6-Pack', '20g protein, no added sugar.', 699, ['food', 'fitness'], ['protein bar'], {}],
    ['COFFEE-BEAN', 'Single-Origin Coffee 250g', 'Medium roast Arabica beans.', 549, ['food', 'beverages'], ['coffee', 'beans'], {}],
    ['OLIVE-OIL-500', 'Extra Virgin Olive Oil 500ml', 'Cold-pressed, glass bottle.', 649, ['food', 'pantry'], ['olive oil'], {}],
    ['CHIA-SEEDS', 'Organic Chia Seeds 400g', 'Omega-3, fibre-rich superfood.', 379, ['food', 'organic'], ['chia', 'superfood'], {}],
    ['SNACK-BAR-12', 'Energy Bar Variety 12-Pack', 'Dates, nuts, dark chocolate.', 799, ['food', 'snacks'], ['energy bar'], {}],
  ]),
};

const KIDZONE = {
  ...KEYS,
  store_name: 'KidZone',
  description: 'Toys, learning kits, and kids essentials',
  policies: { max_order_value: 8000, human_review_above: 3000, discount_cap_percent: 10, daily_ai_gmv_cap: 30000 },
  catalog: generateCatalog('KZ', [
    ['BLOCKS-100', 'Building Blocks 100pc', 'Compatible bricks, storage box.', 999, ['kids', 'toys'], ['blocks', 'building'], {}],
    ['PUZZLE-500', 'Jigsaw Puzzle 500 Pieces', 'World map educational theme.', 449, ['kids', 'learning'], ['puzzle', 'educational'], {}],
    ['ART-KIT', 'Kids Art Supply Kit', 'Crayons, markers, paper, smock.', 699, ['kids', 'creative'], ['art', 'craft'], {}],
    ['SCOOTER-3W', '3-Wheel Scooter', 'Adjustable height, LED wheels.', 2499, ['kids', 'outdoor'], ['scooter'], {}],
    ['BOOK-STEM', 'STEM Experiment Kit Ages 8+', '20 experiments, illustrated guide.', 1299, ['kids', 'learning'], ['stem', 'science'], {}],
    ['LUNCH-BOX', 'Insulated Lunch Box', 'BPA-free, leak-proof compartments.', 599, ['kids', 'essentials'], ['lunch box'], {}],
    ['PLUSH-BEAR', 'Soft Plush Teddy Bear 40cm', 'Hypoallergenic filling, washable.', 799, ['kids', 'toys'], ['plush', 'teddy'], {}],
    ['WATER-BOTTLE-K', 'Kids Water Bottle 500ml', 'Flip straw, drop-resistant.', 399, ['kids', 'essentials'], ['bottle', 'kids'], {}],
    ['GAME-MEMORY', 'Memory Matching Card Game', '48 cards, ages 4+, travel tin.', 349, ['kids', 'games'], ['game', 'memory'], {}],
    ['BACKPACK-KIDS', 'Kids School Backpack', 'Ergonomic, reflective strips, 15L.', 1199, ['kids', 'essentials'], ['backpack', 'school'], {}],
  ]),
};

const AUTOCARE = {
  ...KEYS,
  store_name: 'AutoCare',
  description: 'Car accessories, cleaning, and travel comfort',
  policies: { max_order_value: 15000, human_review_above: 5000, discount_cap_percent: 7, daily_ai_gmv_cap: 40000 },
  catalog: generateCatalog('AC', [
    ['HOLDER-PHONE', 'Magnetic Phone Mount', 'Dashboard/w vent, 360° rotation.', 699, ['automotive', 'accessories'], ['phone mount', 'car'], {}],
    ['CHARGER-DUAL', 'Dual USB Car Charger 45W', 'Fast charge 2 devices.', 899, ['automotive', 'electronics'], ['car charger'], {}],
    ['VAC-CORDLESS', 'Cordless Car Vacuum', 'HEPA filter, crevice tool included.', 2499, ['automotive', 'cleaning'], ['vacuum', 'car'], {}],
    ['MAT-FLOOR-4', 'All-Weather Floor Mats 4pc', 'Custom fit, easy clean rubber.', 1999, ['automotive', 'accessories'], ['floor mats'], {}],
    ['FRESHENER-3', 'Car Air Freshener 3-Pack', 'Long-lasting vent clip style.', 299, ['automotive', 'care'], ['air freshener'], {}],
    ['JUMPER-800A', 'Portable Jump Starter 800A', 'USB power bank, LED flashlight.', 4999, ['automotive', 'emergency'], ['jump starter'], {}],
    ['COVER-WIND', 'Windshield Sun Shade', 'Foldable reflective, universal fit.', 549, ['automotive', 'accessories'], ['sun shade'], {}],
    ['ORG-TRUNK', 'Trunk Organizer', 'Collapsible compartments, handles.', 999, ['automotive', 'organisation'], ['organizer', 'trunk'], {}],
    ['WIPES-INTERIOR', 'Interior Cleaning Wipes 40pc', 'Leather-safe, streak-free.', 349, ['automotive', 'cleaning'], ['wipes', 'cleaning'], {}],
    ['CAM-DASH', 'Dash Cam 1080p', 'Loop recording, G-sensor, night vision.', 3499, ['automotive', 'electronics'], ['dash cam'], {}],
  ]),
};

const ALL_MERCHANTS = [
  GADGETNEST,
  TRAVELESSENTIALS,
  CONNECTHUB,
  HOMEBASICS,
  STYLELANE,
  FITZONE,
  BOOKNOOK,
  TECHVAULT,
  BEAUTYBAR,
  PETPALS,
  GREENSPOON,
  KIDZONE,
  AUTOCARE,
];

function getCatalogStats() {
  const productCount = ALL_MERCHANTS.reduce((sum, m) => sum + m.catalog.length, 0);
  const categories = new Set();
  ALL_MERCHANTS.forEach((m) =>
    m.catalog.forEach((p) => p.data.categories.forEach((c) => categories.add(c)))
  );
  return {
    store_count: ALL_MERCHANTS.length,
    product_count: productCount,
    category_count: categories.size,
    store_names: ALL_MERCHANTS.map((m) => m.store_name),
  };
}

module.exports = { ALL_MERCHANTS, getCatalogStats };
