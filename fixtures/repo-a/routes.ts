import express from "express";
import { getUser } from "./user";

export const app = express();

app.get("/api/users/:id", async (req, res) => {
  res.json(await getUser(req.params.id));
});

app.post("/api/users", async (req, res) => {
  res.status(201).json({ ok: true });
});
