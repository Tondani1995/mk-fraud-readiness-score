# MK Fraud Insights — Tor-only confidential reporting

**STAGING ONLY. NOT LIVE. No real disclosures permitted before independent security and legal approval.**

This isolated project is for GlobaLeaks, a purpose-built secure reporting system which generates a real Tor v3 onion address. It is intentionally separate from the MK Fraud public site, assessment engine, MK Assist, Vercel, GA4, HubSpot and email.

## Provisioning
1. Create a NEW dedicated VPS with a separately managed SSH key, supported Debian 13 or Ubuntu 26.04 image, 2 vCPU and 2GB RAM minimum for pilot testing. Do not reuse existing infrastructure. Agree on jurisdiction, data handling and costs.
2. Restrict host SSH access to trusted admin IP with a cloud firewall. Disallow incoming 80, 443, 8080 and 8443. The bootstrap script binds application ports to host loopback only.
3. Copy the scripts to the server, run sudo bash bootstrap.sh and sudo bash verify.sh.
4. Use an SSH localhost port forward to access https://localhost:8443 and run GlobaLeaks wizard. Configure a separate admin and recipient account, TOTP, reporting categories and privacy notices.
5. Retrieve the ACTUAL generated .onion address from Network > Tor or startup logs and verify in Tor Browser from a different network. Do not invent an onion URL.
6. Test anonymous report, receipt-based follow-up, encrypted backup restore, safe attachments and firewall. Complete a legal POPIA/Protected Disclosures Act and independent security review before publication.

**The site's current general submission terms grant MK broad ownership/use rights, inappropriate for whistleblower intake.** The dedicated reporting notice must supersede that contract for reporting.

The currently connected DigitalOcean administration action can create a Droplet but cannot pass cloud-init user_data or execute remote shell commands. A created Droplet alone is not a functioning onion channel. No reporting endpoint should be advertised from this staging branch.

Sources: https://docs.globaleaks.org/en/stable/setup/installation.html and https://docs.globaleaks.org/en/stable/technical/security/threat-model.html
