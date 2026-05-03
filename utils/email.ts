import { Resend } from "resend";

const resend = new Resend(process.env.re_FgA7a2ob_AvnCoGvWdPGdYCKBdWovRJ5K);

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
    from: "rEEEserve <onboarding@resend.dev>", // change once deployment
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
