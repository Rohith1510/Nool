import { Shell } from "@/components/shell";
import { SignIn } from "@/components/sign-in";
import { databaseConfigured } from "@/lib/supabase/server";
import { connection } from "next/server";
import { Suspense } from "react";
import Loading from "../(workspace)/loading";
export default function SignInPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SignInContent />
    </Suspense>
  );
}
async function SignInContent() {
  await connection();
  return (
    <Shell standalone>
      <SignIn configured={databaseConfigured()} />
    </Shell>
  );
}
