import axios from "axios";

const rows: number[] = []

console.log(rows[0])

// const api = axios.create({
//     baseURL: "http://localhost:3000",
//     timeout: 10000,
// })

// const res = api.post("/users/login", {
//     "email": "test_5@gmail.com",
//     "password": "123"
// })

// res.then((res) => {
//     api.interceptors.request.use((config) => {
//         const {access_token} = res.data;
//         config.headers.Authorization = `Bearer ${access_token}`;
//         return config;
//     })
//     const refreshCookie = res.headers["set-cookie"]?.[0];
//     console.log("set-cookie:", refreshCookie)

//     const res_1 = api.post("/users/refresh", {}, {
//         headers: {
//             Cookie: refreshCookie,  // 手動將 cookie 帶返俾 server
//         },
//     });
//     res_1.then((r) => console.log("refresh response:", r.status, r.data))
//          .catch((e) => console.error("refresh error:", e.message))
// })
