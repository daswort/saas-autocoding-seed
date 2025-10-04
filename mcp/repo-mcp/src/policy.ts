export const ALLOW = ["frontend/","backend/","deploy/","spec/","design/"];
export const isAllowed = (p:string)=> ALLOW.some(a=>p.startsWith(a));