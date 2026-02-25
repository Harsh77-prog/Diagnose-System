import nodemailer from "nodemailer";

if (!process.env.EMAIL || !process.env.EMAIL_PASS) {
  throw new Error("❌ EMAIL or EMAIL_PASS missing in .env");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendMail(
  recipient: string,
  link: string,
  type: "ResetLink" | "verificationLink",
) {
  const html = {
    verificationLink: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verify your email</title>
</head>

<body style="
margin:0;
padding:0;
background-color:#ffffff;
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
color:#000000;
">

<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" style="padding:40px 20px;">

<table width="420" cellpadding="0" cellspacing="0" border="0" style="max-width:420px;">

<!-- Logo / Brand -->
<tr>
<td style="padding-bottom:24px;font-size:18px;font-weight:600;">
YourApp
</td>
</tr>

<!-- Title -->
<tr>
<td style="padding-bottom:16px;font-size:24px;font-weight:600;">
Verify your email
</td>
</tr>

<!-- Description -->
<tr>
<td style="padding-bottom:24px;font-size:14px;line-height:22px;color:#444444;">
Click the button below to verify your email address. This helps us keep your account secure.
</td>
</tr>

<!-- Button -->
<tr>
<td style="padding-bottom:24px;">
<a href="${link}"
style="
display:inline-block;
background-color:#000000;
color:#ffffff;
text-decoration:none;
padding:10px 16px;
font-size:14px;
font-weight:500;
border-radius:6px;
">
Verify email
</a>
</td>
</tr>

<!-- Alternative link -->
<tr>
<td style="padding-bottom:24px;font-size:13px;color:#666666;line-height:20px;">
Or copy and paste this URL into your browser:<br>
<span style="
display:inline-block;
margin-top:8px;
padding:8px 10px;
background-color:#f4f4f4;
border-radius:4px;
font-family:monospace;
font-size:12px;
color:#000000;
word-break:break-all;
">
${link}
</span>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="
padding-top:24px;
font-size:12px;
color:#888888;
border-top:1px solid #eeeeee;
line-height:18px;
">
This link will expire in 15 minutes.<br>
If you did not request this, you can safely ignore this email.
</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>`,
    ResetLink: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset your password</title>
</head>

<body style="
margin:0;
padding:0;
background-color:#ffffff;
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
color:#000000;
">

<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" style="padding:40px 20px;">

<table width="420" cellpadding="0" cellspacing="0" border="0" style="max-width:420px;">

<!-- Brand -->
<tr>
<td style="padding-bottom:24px;font-size:18px;font-weight:600;">
YourApp
</td>
</tr>

<!-- Title -->
<tr>
<td style="padding-bottom:16px;font-size:24px;font-weight:600;">
Reset your password
</td>
</tr>

<!-- Description -->
<tr>
<td style="padding-bottom:24px;font-size:14px;line-height:22px;color:#444444;">
Click the button below to reset your password. If you did not request a password reset, you can safely ignore this email.
</td>
</tr>

<!-- Button -->
<tr>
<td style="padding-bottom:24px;">
<a href="${link}"
style="
display:inline-block;
background-color:#000000;
color:#ffffff;
text-decoration:none;
padding:10px 16px;
font-size:14px;
font-weight:500;
border-radius:6px;
">
Reset password
</a>
</td>
</tr>

<!-- Alternative link -->
<tr>
<td style="padding-bottom:24px;font-size:13px;color:#666666;line-height:20px;">
Or copy and paste this URL into your browser:<br>
<span style="
display:inline-block;
margin-top:8px;
padding:8px 10px;
background-color:#f4f4f4;
border-radius:4px;
font-family:monospace;
font-size:12px;
color:#000000;
word-break:break-all;
">
${link}
</span>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="
padding-top:24px;
font-size:12px;
color:#888888;
border-top:1px solid #eeeeee;
line-height:18px;
">
This password reset link will expire in 15 minutes for security reasons.
</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>`,
  };
  const mailOptions = {
    from: process.env.EMAIL,
    to: recipient,
    subject: type,
    // text: message,
    html: html[type],
  };

  return await new Promise((resolve, reject) => {
    // send mail
    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        reject(error);
        console.log(error);
      } else {
        resolve("Email sent:" + info.response);
        console.log("Email sent: " + info.response);
      }
    });
  });
}
