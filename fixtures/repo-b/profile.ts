import axios from "axios";
import { getUser } from "../repo-a/user";

export async function loadProfile(id: string): Promise<void> {
  const user = await getUser(id);
  await axios.post("/track", { id: user.user_id });
}
