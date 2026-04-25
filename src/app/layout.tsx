import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import "./globals.css";

const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stock Watcher",
  description: "Monitor stock prices and receive email alerts",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html
      lang="en"
      className={`dark ${outfit.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {user && <Nav email={user.email} />}
        {children}
      </body>
    </html>
  );
}
