// Authorization decisions use server-loaded resource owners, never client body fields.
export function canEditOwnedResource(user, resource) {
  return Boolean(user && user.role === "teacher" && resource?.teacherId &&
    String(resource.teacherId) === String(user._id));
}
export function canReadOwnedResource(user, resource) {
  return Boolean(user && resource && resource.status !== "deleted" &&
    (canEditOwnedResource(user, resource) || user.role === "admin" ||
      (resource.published === true && resource.approvedVersion)));
}
export function canViewAllContent(user) {
  return Boolean(user && user.role === "admin");
}
