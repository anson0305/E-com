ALTER TABLE products
ADD COLUMN category_id INT REFERENCES categories(id);