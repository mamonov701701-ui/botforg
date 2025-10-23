import api from "@/api/client";

interface RegisterData {
  email: string;
  password: string;
  [key: string]: any;
}

interface LoginData {
  email: string;
  password: string;
}

interface AuthResponse {
  access_token: string;
  [key: string]: any;
}

export async function register(data: RegisterData): Promise<AuthResponse> {
  const response = await api.post("/register", data);
  localStorage.setItem("token", response.access_token);
  return response;
}

export async function login(data: LoginData): Promise<AuthResponse> {
  const response = await api.post("/login", data);
  localStorage.setItem("token", response.access_token);
  return response;
}

export async function getMe(): Promise<any> {
  const response = await api.get("/me");
  return response;
} 