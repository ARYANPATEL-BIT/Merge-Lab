import axios from "axios";

export interface User {
  user_id: string;
  full_name: string;
  created_at: string;
}

export async function getUser(id: string): Promise<User> {
  const base = process.env.DATABASE_URL;
  const res = await axios.get(`${base}/users/${id}`);
  return res.data;
}
