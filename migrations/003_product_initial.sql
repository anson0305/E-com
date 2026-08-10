create table products (
    id int generated always as identity primary key,
    name varchar(128) not null,
    description varchar(1024) not null default '',
    price float not null check (price>=0),           
    stock int not null check (stock>=0),
    image_url varchar(1024) not null default '',
    category varchar(64) not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);