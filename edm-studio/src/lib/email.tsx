import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";
import { z } from "zod";
export const contentSchema = z.object({
  preheader: z.string().max(180),
  heading: z.string().min(1).max(160),
  body: z.string().min(1).max(10000),
  buttonText: z.string().max(80),
  buttonUrl: z
    .url()
    .refine((u) => u.startsWith("https://"), "请填写 HTTPS 链接"),
  brand: z.string().min(1).max(100),
  address: z.string().min(1).max(300),
  logoUrl: z
    .union([z.literal(""), z.url().refine((u) => u.startsWith("https://"))])
    .default(""),
  imageUrl: z
    .union([z.literal(""), z.url().refine((u) => u.startsWith("https://"))])
    .default(""),
});
export type EmailContent = z.infer<typeof contentSchema>;
export const defaultContent: EmailContent = {
  preheader: "A little colour. A whole new mood.",
  heading: "A little colour. A whole new mood.",
  body: "Hi {{ first_name }},\n\nWelcome to FormWink. We believe useful objects can have personality.\n\nDiscover colourful lighting and small details that make a corner feel more like you. Thanks for inviting us into your inbox.",
  buttonText: "Explore the room edit",
  buttonUrl: "https://formwink.com/collections/all",
  brand: "FORMWINK",
  address:
    "DEMO · Add your registered company name and postal address before sending.",
  logoUrl: "",
  imageUrl: "",
};
const replace = (s: string, vars: Record<string, string>) =>
  s.replace(/{{\s*(\w+)\s*}}/g, (_, key) => vars[key] ?? "朋友");
export async function renderEmail(
  input: EmailContent,
  vars: Record<string, string> = { first_name: "Alex" },
) {
  const c = contentSchema.parse(input);
  const unsub = "{{{RESEND_UNSUBSCRIBE_URL}}}";
  const email = (
    <Html lang="zh-CN">
      <Head />
      <Preview>{replace(c.preheader, vars)}</Preview>
      <Body
        style={{
          backgroundColor: "#f4f5f8",
          fontFamily: "Arial, sans-serif",
          padding: "32px 12px",
        }}
      >
        <Container
          style={{
            maxWidth: 560,
            backgroundColor: "#ffffff",
            padding: 40,
            borderRadius: 12,
          }}
        >
          {c.logoUrl ? (
            <Img src={c.logoUrl} width={120} alt={c.brand} />
          ) : (
            <Text
              style={{
                fontSize: 14,
                letterSpacing: 5,
                fontWeight: "bold",
                color: "#6c52d9",
              }}
            >
              {c.brand}
            </Text>
          )}
          <Hr style={{ borderColor: "#e9eaf0", margin: "24px 0" }} />
          {c.imageUrl && (
            <Img
              src={c.imageUrl}
              width={480}
              alt=""
              style={{ maxWidth: "100%", borderRadius: 8 }}
            />
          )}
          <Heading style={{ color: "#182238", fontSize: 30, lineHeight: 1.35 }}>
            {replace(c.heading, vars)}
          </Heading>
          {replace(c.body, vars)
            .split("\n")
            .map((p, i) => (
              <Text
                key={i}
                style={{ color: "#596277", fontSize: 15, lineHeight: 1.8 }}
              >
                {p || "\u00a0"}
              </Text>
            ))}
          <Button
            href={c.buttonUrl}
            style={{
              backgroundColor: "#6c52d9",
              borderRadius: 6,
              padding: "15px 24px",
              color: "#fff",
              fontWeight: "bold",
            }}
          >
            {c.buttonText}
          </Button>
          <Hr style={{ margin: "32px 0 20px", borderColor: "#e9eaf0" }} />
          <Text style={{ color: "#8a8f9d", fontSize: 11, lineHeight: 1.7 }}>
            {c.brand} · {c.address}
            <br />
            You received this email because you subscribed to our brand updates.
            <br />
            <Link href={unsub} style={{ color: "#6c52d9" }}>
              退订邮件 / Unsubscribe
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
  return {
    html: await render(email),
    text: await render(email, { plainText: true }),
  };
}
