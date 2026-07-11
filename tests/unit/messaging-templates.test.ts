import { describe, expect, it } from "vitest";
import {
  bookingConfirmationEmail,
  bookingReminderEmail,
  reviewRequestEmail,
  memberInvitationEmail,
  type BookingEmailContext,
} from "@/lib/messaging/templates";

function fakeBookingContext(overrides: Partial<BookingEmailContext> = {}): BookingEmailContext {
  return {
    workspaceName: "Desert Tours Co",
    guestFirstName: "Jane",
    reference: "ABC23456",
    tourTitle: "Desert Jeep Tour",
    departureStartsAt: new Date("2026-08-01T16:00:00Z"),
    timezone: "America/Phoenix",
    location: "Sedona, AZ",
    meetingPoint: "North gate",
    totalAmount: 10500,
    currency: "USD",
    confirmationUrl: "https://example.com/book/confirmation/tok123",
    ...overrides,
  };
}

describe("bookingConfirmationEmail", () => {
  it("includes the reference, tour title, and confirmation link in both text and html", () => {
    const rendered = bookingConfirmationEmail(fakeBookingContext());
    expect(rendered.subject).toContain("ABC23456");
    expect(rendered.subject).toContain("Desert Jeep Tour");
    expect(rendered.text).toContain("ABC23456");
    expect(rendered.text).toContain("https://example.com/book/confirmation/tok123");
    expect(rendered.html).toContain("Desert Jeep Tour");
    expect(rendered.html).toContain("https://example.com/book/confirmation/tok123");
  });

  it("escapes HTML-significant characters from guest-controlled fields", () => {
    const rendered = bookingConfirmationEmail(
      fakeBookingContext({ tourTitle: `<script>alert("xss")</script>` }),
    );
    expect(rendered.html).not.toContain("<script>alert");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("omits location/meeting point lines when not provided", () => {
    const rendered = bookingConfirmationEmail(fakeBookingContext({ location: null, meetingPoint: null }));
    expect(rendered.text).not.toContain("Location:");
    expect(rendered.text).not.toContain("Meeting point:");
  });
});

describe("bookingReminderEmail", () => {
  it("frames the message as a pre-departure reminder, not a confirmation", () => {
    const rendered = bookingReminderEmail(fakeBookingContext());
    expect(rendered.subject.toLowerCase()).toContain("reminder");
    expect(rendered.text.toLowerCase()).toContain("departs within the next 24 hours");
  });
});

describe("reviewRequestEmail", () => {
  it("includes a working unsubscribe link that the other two templates never include", () => {
    const rendered = reviewRequestEmail({
      ...fakeBookingContext(),
      unsubscribeUrl: "https://example.com/unsubscribe/tok456",
    });
    expect(rendered.text).toContain("https://example.com/unsubscribe/tok456");
    expect(rendered.html).toContain("https://example.com/unsubscribe/tok456");

    const confirmation = bookingConfirmationEmail(fakeBookingContext());
    const reminder = bookingReminderEmail(fakeBookingContext());
    expect(confirmation.html).not.toContain("/unsubscribe/");
    expect(reminder.html).not.toContain("/unsubscribe/");
  });
});

describe("memberInvitationEmail", () => {
  it("names the inviter, the role, and includes the invite link", () => {
    const rendered = memberInvitationEmail({
      workspaceName: "Desert Tours Co",
      inviterName: "Marco",
      role: "workspace_admin",
      inviteUrl: "https://example.com/invite/tok789",
      expiresAt: new Date("2026-08-08T00:00:00Z"),
    });
    expect(rendered.subject).toContain("Marco");
    expect(rendered.subject).toContain("Desert Tours Co");
    expect(rendered.text).toContain("https://example.com/invite/tok789");
    expect(rendered.html).toContain("workspace admin");
  });
});
