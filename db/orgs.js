import { query, rows, one } from "#db/client";

export const getOrgById = (id) =>
  one(`SELECT * FROM organizations WHERE id = $1`, [id]);

// The oldest org is the shared workspace new accounts join.
export const getSharedOrg = () =>
  one(`SELECT * FROM organizations ORDER BY id LIMIT 1`);

// Creating an org also seats the creator as its founding owner.
export const createOrg = async ({ name, slug, createdBy }) => {
  const org = await one(
    `INSERT INTO organizations (name, slug, created_by) VALUES ($1,$2,$3) RETURNING *`,
    [name, slug, createdBy ?? null]);
  if (createdBy) await addMember({ orgId: org.id, userId: createdBy, role: "owner" });
  return org;
};

