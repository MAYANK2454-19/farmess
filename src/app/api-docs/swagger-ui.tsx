"use client";

import Script from "next/script";
import { useState } from "react";

const SWAGGER_VERSION = "5.17.14";
const SWAGGER_BASE = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}`;

type SwaggerWindow = Window & {
  SwaggerUIBundle?: (options: Record<string, unknown>) => unknown;
};

export function SwaggerUi() {
  const [failed, setFailed] = useState(false);

  return (
    <>
      <link rel="stylesheet" href={`${SWAGGER_BASE}/swagger-ui.css`} />
      <Script
        src={`${SWAGGER_BASE}/swagger-ui-bundle.js`}
        strategy="afterInteractive"
        onError={() => setFailed(true)}
        onReady={() => {
          const bundle = (window as SwaggerWindow).SwaggerUIBundle;
          if (!bundle) {
            setFailed(true);
            return;
          }
          bundle({
            url: "/openapi.json",
            dom_id: "#swagger-ui",
            deepLinking: true,
            withCredentials: true,
            tryItOutEnabled: false,
          });
        }}
      />
      {failed ? (
        <p className="api-docs-fallback" role="alert">
          The interactive viewer could not load. The raw specification is available at{" "}
          <a href="/openapi.json">/openapi.json</a> and can be imported into Postman.
        </p>
      ) : null}
      <div id="swagger-ui" />
    </>
  );
}
