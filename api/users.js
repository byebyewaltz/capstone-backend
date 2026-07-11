import express from "express";
import { createUser, getUserByUsernameAndPassword } from "#db/queries/users";
import requireBody from "#middleware/requireBody";
import { createToken } from "#utils/jwt";

const router = express.Router();
export default router;

const authFields = requireBody(["username", "password"]);

const sendToken = async (res, user, status = 200) =>
  res.status(status).send(await createToken({ id: user.id }));

router.post("/register", authFields, async (req, res) => {
  const { username, password } = req.body;
  await sendToken(res, await createUser(username, password), 201);
});

router.post("/login", authFields, async (req, res) => {
  const { username, password } = req.body;
  const user = await getUserByUsernameAndPassword(username, password);

  if (!user)
    return res.status(401).send("Invalid username or password.");

  await sendToken(res, user);
});
