import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
export default async function Login() {
  if (await getSession()) redirect("/");
  return (
    <LoginForm
      demo={process.env.DEMO_MODE === "true"}
      local={process.env.LOCAL_MODE === "true"}
    />
  );
}
