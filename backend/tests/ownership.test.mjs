import test from "node:test";
import assert from "node:assert/strict";
import { requireOwner, requireResourceOwner } from "../src/middleware/ownership.js";

function invoke(middleware, req) {
  const result = { nextCalled: false, code: 200, payload: null };
  const res = {
    status(n) { result.code = n; return this; },
    json(data) { result.payload = data; return this; }
  };
  middleware(req, res, () => { result.nextCalled = true; });
  return result;
}

test("anonymous users cannot access owner endpoints", () => {
  assert.equal(invoke(requireOwner(req => req.params.id), {params: {id:"1"}}).code,401);
});
test("owner can access own resource", () => {
  assert.equal(invoke(requireOwner(req => req.params.id), {user:{_id:"1",role:"teacher"},params:{id:"1"}}).nextCalled,true);
});
test("other teacher and student cannot access owner resource", () => {
  for(const role of ["teacher","student"]){
    assert.equal(invoke(requireOwner(req => req.params.id), {user:{_id:"2",role},params:{id:"1"}}).code,403);
  }
});
test("admin cannot bypass ownership unless explicitly allowed", () => {
  const req={user:{_id:"admin",role:"admin"},params:{id:"1"}};
  assert.equal(invoke(requireOwner(r=>r.params.id),req).code,403);
  assert.equal(invoke(requireOwner(r=>r.params.id,{allowAdmin:true}),req).nextCalled,true);
});
test("resource owner is loaded from server resource, never request body", () => {
  const req={user:{_id:"actor",role:"teacher"},resource:{teacherId:"actual-owner"},body:{ownerId:"actor"}};
  assert.equal(invoke(requireResourceOwner(),req).code,403);
  req.user._id="actual-owner";
  assert.equal(invoke(requireResourceOwner(),req).nextCalled,true);
});
