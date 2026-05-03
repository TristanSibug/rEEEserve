import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail =
  process.env.RESEND_FROM_EMAIL ?? "rEEEserve <onboarding@resend.dev>";

if (!resendApiKey) {
  throw new Error("Missing RESEND_API_KEY environment variable.");
}

const resend = new Resend(resendApiKey);

export async function sendReservationCancelledEmail({
  to,
  room,
  date,
  timeStart,
  timeEnd,
  instructorName,
}: {
  to: string;
  room: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  instructorName?: string;
}) {
  return resend.emails.send({
    from: resendFromEmail,
    to,
    subject: "Your rEEEserve booking was cancelled",
    html: `
      <p>Hello,</p>

      <p>
        Your reservation for <strong>${room}</strong> on
        <strong>${date}</strong> from
        <strong>${timeStart}</strong> to <strong>${timeEnd}</strong>
        has been cancelled because an instructor reserved the room.
      </p>

      ${instructorName
        ? `<p>Instructor: <strong>${instructorName}</strong></p>`
        : ""
      }

      <p>
        Please rebook another available time slot in rEEEserve.
      </p>

      <p>Thank you.</p>
    `,
  });
}
