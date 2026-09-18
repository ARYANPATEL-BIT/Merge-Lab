import axios from "axios";
import { User } from "./types";

export async function getUser(id: string): Promise<User> {
  const base = process.env.DATABASE_URL;
  const res = await axios.get(`${base}/users/${id}`);
  return res.data;
}
