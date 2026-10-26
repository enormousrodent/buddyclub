# Supabase email templates, on brand

Paste each block into Supabase: Authentication > Email templates, one per row, with the subject
shown. Inline styles only, table layout, system fonts, the lime tile logo served from the app
(`https://www.buddy-club.com/icons/rally-192.png`), so every mail client renders the same thing.
Colours: paper `#f6f3ec`, ink `#0e1728`, lime `#e6fe6f`.

**Rule:** the two sign-in templates and Reauthentication carry the code only and no link, because
Outlook pre-opens links and the code and link are one token. The others are links.

## Confirm sign up

**Subject:** `Your Buddy Club code`  
Sent to a new address, whichever flow asked. Code only, no link: a link can be pre-opened by a mail scanner and would burn the code.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Your Buddy Club code</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f3ec;">
    <div style="display:none;max-height:0;overflow:hidden;color:#f6f3ec;">
      Your sign-in code is inside.
    </div>
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      style="background:#f6f3ec;"
    >
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            style="max-width:520px;"
          >
            <tr>
              <td style="padding:0 0 20px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding-right:12px;">
                      <img
                        src="https://www.buddy-club.com/icons/rally-192.png"
                        width="40"
                        height="40"
                        alt=""
                        style="display:block;border-radius:9px;"
                      />
                    </td>
                    <td
                      style="font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:20px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#0e1728;"
                    >
                      Buddy Club
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td
                style="background:#ffffff;border:1px solid #e3ded3;border-radius:16px;padding:28px 28px 24px 28px;font-family:Helvetica,Arial,sans-serif;color:#0e1728;"
              >
                <h1
                  style="margin:0 0 10px 0;font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:26px;line-height:30px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;color:#0e1728;"
                >
                  Your code
                </h1>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:23px;color:#3a3f4b;">
                  Type this on the sign-in screen to finish creating your account. It lasts an hour.
                </p>
                <table
                  role="presentation"
                  cellspacing="0"
                  cellpadding="0"
                  style="margin:4px 0 8px 0;"
                >
                  <tr>
                    <td
                      style="background:#e6fe6f;border-radius:12px;padding:14px 22px;font-family:Courier New,Courier,monospace;font-size:34px;line-height:40px;font-weight:bold;letter-spacing:8px;color:#0e1728;"
                    >
                      {{ .Token }}
                    </td>
                  </tr>
                </table>
                <p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:#6b6f7a;">
                  Nothing to click. Just the code, so nobody can use it but you.
                </p>
              </td>
            </tr>
            <tr>
              <td
                style="padding:20px 8px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#6b6f7a;"
              >
                Buddy Club &middot;
                <a href="https://www.buddy-club.com" style="color:#6b6f7a;">buddy-club.com</a><br />
                If you didn&rsquo;t ask for this, you can ignore it. Nothing changes until you act.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Magic link or OTP

**Subject:** `Your Buddy Club code`  
Sent to an address we already know. Code only, no link, same reason.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Your Buddy Club code</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f3ec;">
    <div style="display:none;max-height:0;overflow:hidden;color:#f6f3ec;">
      Your sign-in code is inside.
    </div>
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      style="background:#f6f3ec;"
    >
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            style="max-width:520px;"
          >
            <tr>
              <td style="padding:0 0 20px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding-right:12px;">
                      <img
                        src="https://www.buddy-club.com/icons/rally-192.png"
                        width="40"
                        height="40"
                        alt=""
                        style="display:block;border-radius:9px;"
                      />
                    </td>
                    <td
                      style="font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:20px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#0e1728;"
                    >
                      Buddy Club
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td
                style="background:#ffffff;border:1px solid #e3ded3;border-radius:16px;padding:28px 28px 24px 28px;font-family:Helvetica,Arial,sans-serif;color:#0e1728;"
              >
                <h1
                  style="margin:0 0 10px 0;font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:26px;line-height:30px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;color:#0e1728;"
                >
                  Your code
                </h1>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:23px;color:#3a3f4b;">
                  Type this on the sign-in screen and you&rsquo;re in. It lasts an hour.
                </p>
                <table
                  role="presentation"
                  cellspacing="0"
                  cellpadding="0"
                  style="margin:4px 0 8px 0;"
                >
                  <tr>
                    <td
                      style="background:#e6fe6f;border-radius:12px;padding:14px 22px;font-family:Courier New,Courier,monospace;font-size:34px;line-height:40px;font-weight:bold;letter-spacing:8px;color:#0e1728;"
                    >
                      {{ .Token }}
                    </td>
                  </tr>
                </table>
                <p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:#6b6f7a;">
                  Nothing to click. Just the code, so nobody can use it but you.
                </p>
              </td>
            </tr>
            <tr>
              <td
                style="padding:20px 8px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#6b6f7a;"
              >
                Buddy Club &middot;
                <a href="https://www.buddy-club.com" style="color:#6b6f7a;">buddy-club.com</a><br />
                If you didn&rsquo;t ask for this, you can ignore it. Nothing changes until you act.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Invite user

**Subject:** `You&rsquo;re invited to Buddy Club`  
Only used when someone is invited from the Supabase dashboard. Clubs invite through the app, not this.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>You're invited to Buddy Club</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f3ec;">
    <div style="display:none;max-height:0;overflow:hidden;color:#f6f3ec;">
      An invitation to Buddy Club.
    </div>
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      style="background:#f6f3ec;"
    >
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            style="max-width:520px;"
          >
            <tr>
              <td style="padding:0 0 20px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding-right:12px;">
                      <img
                        src="https://www.buddy-club.com/icons/rally-192.png"
                        width="40"
                        height="40"
                        alt=""
                        style="display:block;border-radius:9px;"
                      />
                    </td>
                    <td
                      style="font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:20px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#0e1728;"
                    >
                      Buddy Club
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td
                style="background:#ffffff;border:1px solid #e3ded3;border-radius:16px;padding:28px 28px 24px 28px;font-family:Helvetica,Arial,sans-serif;color:#0e1728;"
              >
                <h1
                  style="margin:0 0 10px 0;font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:26px;line-height:30px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;color:#0e1728;"
                >
                  You&rsquo;re in
                </h1>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:23px;color:#3a3f4b;">
                  Someone has invited you to Buddy Club: racket-sport sessions with fair rotations,
                  your buddies and your nights, on your phone.
                </p>
                <table
                  role="presentation"
                  cellspacing="0"
                  cellpadding="0"
                  style="margin:4px 0 8px 0;"
                >
                  <tr>
                    <td style="background:#e6fe6f;border-radius:12px;">
                      <a
                        href="{{ .ConfirmationURL }}"
                        style="display:inline-block;padding:14px 24px;font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#0e1728;text-decoration:none;"
                        >Accept the invite</a
                      >
                    </td>
                  </tr>
                </table>
                <p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:#6b6f7a;">
                  If the button does nothing, copy this into your browser:<br /><a
                    href="{{ .ConfirmationURL }}"
                    style="color:#0e1728;word-break:break-all;"
                    >{{ .ConfirmationURL }}</a
                  >
                </p>
              </td>
            </tr>
            <tr>
              <td
                style="padding:20px 8px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#6b6f7a;"
              >
                Buddy Club &middot;
                <a href="https://www.buddy-club.com" style="color:#6b6f7a;">buddy-club.com</a><br />
                If you didn&rsquo;t ask for this, you can ignore it. Nothing changes until you act.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Change email address

**Subject:** `Confirm your new email`  
Sent to the new address. The app has no change-email screen yet; this is for the day it does.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Confirm your new email</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f3ec;">
    <div style="display:none;max-height:0;overflow:hidden;color:#f6f3ec;">
      Confirm the change to your Buddy Club email.
    </div>
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      style="background:#f6f3ec;"
    >
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            style="max-width:520px;"
          >
            <tr>
              <td style="padding:0 0 20px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding-right:12px;">
                      <img
                        src="https://www.buddy-club.com/icons/rally-192.png"
                        width="40"
                        height="40"
                        alt=""
                        style="display:block;border-radius:9px;"
                      />
                    </td>
                    <td
                      style="font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:20px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#0e1728;"
                    >
                      Buddy Club
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td
                style="background:#ffffff;border:1px solid #e3ded3;border-radius:16px;padding:28px 28px 24px 28px;font-family:Helvetica,Arial,sans-serif;color:#0e1728;"
              >
                <h1
                  style="margin:0 0 10px 0;font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:26px;line-height:30px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;color:#0e1728;"
                >
                  New email
                </h1>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:23px;color:#3a3f4b;">
                  You asked to move your Buddy Club account from <strong>{{ .Email }}</strong> to
                  <strong>{{ .NewEmail }}</strong>. Confirm it from the new address.
                </p>
                <table
                  role="presentation"
                  cellspacing="0"
                  cellpadding="0"
                  style="margin:4px 0 8px 0;"
                >
                  <tr>
                    <td style="background:#e6fe6f;border-radius:12px;">
                      <a
                        href="{{ .ConfirmationURL }}"
                        style="display:inline-block;padding:14px 24px;font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#0e1728;text-decoration:none;"
                        >Confirm new email</a
                      >
                    </td>
                  </tr>
                </table>
                <p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:#6b6f7a;">
                  If the button does nothing, copy this into your browser:<br /><a
                    href="{{ .ConfirmationURL }}"
                    style="color:#0e1728;word-break:break-all;"
                    >{{ .ConfirmationURL }}</a
                  >
                </p>
              </td>
            </tr>
            <tr>
              <td
                style="padding:20px 8px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#6b6f7a;"
              >
                Buddy Club &middot;
                <a href="https://www.buddy-club.com" style="color:#6b6f7a;">buddy-club.com</a><br />
                If you didn&rsquo;t ask for this, you can ignore it. Nothing changes until you act.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Reset password

**Subject:** `Reset your Buddy Club password`  
There is no reset screen in the app yet; sign in with a code and set a new password from the profile. Kept on brand for when a reset flow exists.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Reset your Buddy Club password</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f3ec;">
    <div style="display:none;max-height:0;overflow:hidden;color:#f6f3ec;">Reset your password.</div>
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      style="background:#f6f3ec;"
    >
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            style="max-width:520px;"
          >
            <tr>
              <td style="padding:0 0 20px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding-right:12px;">
                      <img
                        src="https://www.buddy-club.com/icons/rally-192.png"
                        width="40"
                        height="40"
                        alt=""
                        style="display:block;border-radius:9px;"
                      />
                    </td>
                    <td
                      style="font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:20px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#0e1728;"
                    >
                      Buddy Club
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td
                style="background:#ffffff;border:1px solid #e3ded3;border-radius:16px;padding:28px 28px 24px 28px;font-family:Helvetica,Arial,sans-serif;color:#0e1728;"
              >
                <h1
                  style="margin:0 0 10px 0;font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:26px;line-height:30px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;color:#0e1728;"
                >
                  Reset password
                </h1>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:23px;color:#3a3f4b;">
                  Tap the button to choose a new password. If you&rsquo;d rather not, sign in with a
                  code and set one from your profile.
                </p>
                <table
                  role="presentation"
                  cellspacing="0"
                  cellpadding="0"
                  style="margin:4px 0 8px 0;"
                >
                  <tr>
                    <td style="background:#e6fe6f;border-radius:12px;">
                      <a
                        href="{{ .ConfirmationURL }}"
                        style="display:inline-block;padding:14px 24px;font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#0e1728;text-decoration:none;"
                        >Choose a new password</a
                      >
                    </td>
                  </tr>
                </table>
                <p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:#6b6f7a;">
                  If the button does nothing, copy this into your browser:<br /><a
                    href="{{ .ConfirmationURL }}"
                    style="color:#0e1728;word-break:break-all;"
                    >{{ .ConfirmationURL }}</a
                  >
                </p>
              </td>
            </tr>
            <tr>
              <td
                style="padding:20px 8px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#6b6f7a;"
              >
                Buddy Club &middot;
                <a href="https://www.buddy-club.com" style="color:#6b6f7a;">buddy-club.com</a><br />
                If you didn&rsquo;t ask for this, you can ignore it. Nothing changes until you act.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Reauthentication

**Subject:** `Your Buddy Club code`  
Sent before a sensitive change. Code only; this template never carries a link.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Your Buddy Club code</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f3ec;">
    <div style="display:none;max-height:0;overflow:hidden;color:#f6f3ec;">
      Your confirmation code is inside.
    </div>
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      style="background:#f6f3ec;"
    >
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            style="max-width:520px;"
          >
            <tr>
              <td style="padding:0 0 20px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding-right:12px;">
                      <img
                        src="https://www.buddy-club.com/icons/rally-192.png"
                        width="40"
                        height="40"
                        alt=""
                        style="display:block;border-radius:9px;"
                      />
                    </td>
                    <td
                      style="font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:20px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#0e1728;"
                    >
                      Buddy Club
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td
                style="background:#ffffff;border:1px solid #e3ded3;border-radius:16px;padding:28px 28px 24px 28px;font-family:Helvetica,Arial,sans-serif;color:#0e1728;"
              >
                <h1
                  style="margin:0 0 10px 0;font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:26px;line-height:30px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;color:#0e1728;"
                >
                  Confirm it&rsquo;s you
                </h1>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:23px;color:#3a3f4b;">
                  Type this code to confirm the change you just asked for.
                </p>
                <table
                  role="presentation"
                  cellspacing="0"
                  cellpadding="0"
                  style="margin:4px 0 8px 0;"
                >
                  <tr>
                    <td
                      style="background:#e6fe6f;border-radius:12px;padding:14px 22px;font-family:Courier New,Courier,monospace;font-size:34px;line-height:40px;font-weight:bold;letter-spacing:8px;color:#0e1728;"
                    >
                      {{ .Token }}
                    </td>
                  </tr>
                </table>
                <p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:#6b6f7a;">
                  Didn&rsquo;t ask for anything? Ignore this and nothing changes.
                </p>
              </td>
            </tr>
            <tr>
              <td
                style="padding:20px 8px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#6b6f7a;"
              >
                Buddy Club &middot;
                <a href="https://www.buddy-club.com" style="color:#6b6f7a;">buddy-club.com</a><br />
                If you didn&rsquo;t ask for this, you can ignore it. Nothing changes until you act.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```
