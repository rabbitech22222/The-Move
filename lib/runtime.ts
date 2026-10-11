export const usesLocalFiles = () =>
  process.env.LOCAL_MODE === "true" || process.env.DEMO_MODE === "true";
export const isLocalOperation = () =>
  process.env.LOCAL_MODE === "true" && process.env.DEMO_MODE !== "true";
