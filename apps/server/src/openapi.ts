import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { rpcContract } from "@zarbit/contracts/rpc";

export function generateOpenApi() {
  const generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  });
  return generator.generate(rpcContract, {
    info: { title: "Zarbit API", version: "1.0.0" },
    servers: [{ url: "/openapi" }],
    components: {
      securitySchemes: {
        telegram: {
          type: "apiKey",
          in: "header",
          name: "X-Telegram-Init-Data",
        },
      },
    },
    security: [{ telegram: [] }],
  });
}
