create table users (
    id int primary key,
    name varchar(64),
    email VARCHAR(100) UNIQUE,
    created_at timestamptz default NOW(),
    password varchar(255) not null
);