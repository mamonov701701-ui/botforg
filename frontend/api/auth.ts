import api from "./client";

export async function register(data) {
  const response = await api.post("/register", data);
  localStorage.setItem("token", response.data.access_token);
  return response.data;
}

export async function login(data) {
  const response = await api.post("/login", data);
  localStorage.setItem("token", response.data.access_token);
  return response.data;
}

export async function getMe() {
  const response = await api.get("/me");
  return response.data;
} 