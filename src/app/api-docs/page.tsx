import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { SwaggerUi } from "./swagger-ui";

export const metadata: Metadata = {
  title: "API reference",
  description: "OpenAPI reference for the Farmess route handlers.",
};

export default function ApiDocsPage() {
  return (
    <div className="api-docs">
      <header className="api-docs-header field-ground">
        <Link href="/" aria-label="Farmess home">
          <BrandLogo size={32} tone="light" />
        </Link>
        <div>
          <h1>API reference</h1>
          <p>
            OpenAPI 3.1 description of every Farmess route handler. Sign in at{" "}
            <Link href="/login">/login</Link> on this site to try authenticated endpoints. Import{" "}
            <a href="/openapi.json">/openapi.json</a> into Postman for a ready-made collection.
          </p>
        </div>
      </header>
      <main className="api-docs-body">
        <SwaggerUi />
      </main>
    </div>
  );
}
