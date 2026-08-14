# ACE Host SMS launch checklist

The code contains consent gating for lead-triggered SMS, opt-out language in automated messages, and inbound STOP/START/HELP handling. That does not by itself constitute Twilio or carrier approval.

Before using ACE SMS beyond a controlled demonstration:

- Assign an ACE-only Twilio number; do not move a Black Hole or Buddy inbound webhook.
- Register the sending number under the appropriate Twilio messaging profile or A2P campaign.
- Publish ACE Host Terms and Privacy pages that describe SMS use, frequency, message/data rates, STOP, and HELP.
- Use an unchecked, optional SMS-consent checkbox on the ACE lead form and store the consent text, timestamp, source URL, and phone number.
- Configure the ACE number's inbound webhook to `https://ace-sms-worker.cryptocapitalgroupfl.workers.dev/twilio/inbound` and its status callback to the ACE SMS worker.
- Test START, STOP, HELP, wrong-number handling, and suppression before prospect outreach.

For today's controlled voice demonstration, use an ACE-only number if available and avoid unsolicited SMS. The existing dashboard is an operator tool, not evidence of public website opt-in.
