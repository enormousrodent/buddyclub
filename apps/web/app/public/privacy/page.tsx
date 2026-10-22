import type { Metadata } from 'next';
import Link from 'next/link';
import { Contents, LegalPage } from '../../../components/legal';
import { LEGAL } from '../../../lib/legal';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'How Buddy Club collects, uses, shares and keeps personal data, the cookies it sets, and your rights.',
  alternates: { canonical: '/privacy' },
};

const SECTIONS = [
  { id: 'who', label: 'Who we are' },
  { id: 'what', label: 'What we collect' },
  { id: 'why', label: 'Why we use it and our lawful basis' },
  { id: 'organisers', label: 'Data added by organisers about other people' },
  { id: 'sharing', label: 'Who can see your data' },
  { id: 'processors', label: 'Services we rely on and where data is stored' },
  { id: 'cookies', label: 'Cookies and similar technology' },
  { id: 'retention', label: 'How long we keep data' },
  { id: 'rights', label: 'Your rights' },
  { id: 'children', label: 'Children' },
  { id: 'security', label: 'Security' },
  { id: 'changes', label: 'Changes to this policy' },
  { id: 'contact', label: 'Contact' },
];

export default function PrivacyPage() {
  const email = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;
  return (
    <LegalPage
      title="Privacy policy"
      lead="Buddy Club helps people play racket sports together: find buddies, groups and clubs, and run sessions, rotations and leagues. This policy explains what personal data the service collects, why, who can see it, and what you can do about it."
    >
      <Contents items={SECTIONS} />

      <h2 id="who">1. Who we are</h2>
      <p>
        <strong>{LEGAL.operator}</strong> operates the websites and apps at {LEGAL.hosts[0]} and{' '}
        {LEGAL.hosts[1]} (together, the <strong>Service</strong>). For the data described in this
        policy we are the <strong>data controller</strong>, except for records that a club or group
        organiser adds about other people, which section 4 explains. You can reach us at {email}.
      </p>
      <p>
        This policy is written for the UK General Data Protection Regulation (UK GDPR) and the Data
        Protection Act 2018. If you use the Service from elsewhere, we apply the same standards.
      </p>

      <h2 id="what">2. What we collect</h2>
      <h3>Account and sign-in</h3>
      <ul>
        <li>
          Your email address, and a password if you choose one. Passwords are stored only as a
          salted hash by our authentication provider; we never see them.
        </li>
        <li>
          The full name you type when you create an account, which becomes your initial display
          name.
        </li>
        <li>
          If we later offer sign-in with Google or Apple and you use it, the name, email address and
          profile picture that provider shares with us. We use these only to create and sign you in
          to your account and do not request any other data from your provider account.
        </li>
        <li>Sign-in events, including the time and the rough device and browser type.</li>
      </ul>
      <h3>Profile</h3>
      <ul>
        <li>Your display name, which you can change at any time.</li>
        <li>A profile picture, if you upload one.</li>
        <li>Interests and a locality you choose, used to suggest nearby groups and gatherings.</li>
        <li>Your theme preference and first-run choices (sports, role).</li>
      </ul>
      <h3>Taking part</h3>
      <ul>
        <li>The clubs and groups you belong to, your role in them, and when you joined.</li>
        <li>Gatherings and sessions you RSVP to, check in to, or attend, and the time of each.</li>
        <li>
          Play records: court assignments, pairings, rotations, match results, scores, standings and
          league or tournament positions.
        </li>
        <li>
          Content you add: group names and descriptions, gathering details, venue details, club
          names and notes.
        </li>
        <li>Invitations and join codes you create or redeem, and who used them.</li>
      </ul>
      <h3>Technical data</h3>
      <ul>
        <li>
          Server logs with your IP address, request path, time, browser type and the result of the
          request. We use them to keep the Service running, to find faults and to stop abuse.
        </li>
        <li>
          An audit trail of significant actions (for example who changed a result or removed a
          member), kept so organisers can resolve disputes.
        </li>
      </ul>
      <p>
        We do not use advertising trackers or third-party analytics, and we do not collect precise
        location from your device. The locality you see is the one you type or pick.
      </p>

      <h2 id="why">3. Why we use it and our lawful basis</h2>
      <ul>
        <li>
          <strong>To provide the Service</strong> (performance of a contract): creating and signing
          in to your account, showing you groups and sessions, letting organisers run them, running
          rotations and leagues, and sending the emails needed to sign in or confirm an action.
        </li>
        <li>
          <strong>To suggest things near you</strong> (our legitimate interest in making the Service
          useful, guided by the interests and locality you choose): ranking public groups and
          gatherings on the home and explore pages.
        </li>
        <li>
          <strong>To keep the Service safe and working</strong> (legitimate interest): logs, rate
          limits, fraud and abuse prevention, backups, and the audit trail.
        </li>
        <li>
          <strong>To meet legal obligations</strong>: responding to lawful requests and keeping
          records we are required to keep.
        </li>
        <li>
          <strong>With your consent</strong> where we ask for it, for example before any product
          news emails. You can withdraw consent at any time.
        </li>
      </ul>
      <p>
        We do not sell personal data and we do not use it for automated decisions with legal effect.
      </p>

      <h2 id="organisers">4. Data added by organisers about other people</h2>
      <p>
        Organisers can add people to a club or session who do not have an account, usually a walk-in
        or a regular player, by typing a name and optionally a contact detail. The organiser’s club
        decides whom to add and is responsible for having a good reason to do so and for telling the
        person. We process those records on the club’s behalf to run its sessions, leagues and
        results, and we apply this policy’s security and retention rules to them.
      </p>
      <p>
        If someone has added you and you would rather not appear, contact the organiser first; if
        that does not resolve it, contact us at {email} and we will help. A person without an
        account can later claim their record by proving to the organiser that it is theirs, after
        which the history stays attached to the same record.
      </p>

      <h2 id="sharing">5. Who can see your data</h2>
      <ul>
        <li>
          <strong>Members of your clubs and groups</strong> see your display name, picture,
          attendance, pairings and results for that club or group. They do not see your email
          address unless you share it.
        </li>
        <li>
          <strong>Organisers</strong> of a club or group you belong to can also see your email
          address and when you joined, so they can run it.
        </li>
        <li>
          <strong>Anyone, when something is public.</strong> Public groups and gatherings appear in
          search and on the home and explore pages with the organiser’s chosen description and
          counts, not member lists. When an organiser turns on a public board for a session or meet,
          anyone with its link can see team names, courts, scores, standings and timers, and on
          social session court boards the display names of the players on court. Public boards never
          show contact or profile details.
        </li>
        <li>
          <strong>Service providers</strong> listed in section 6, who act on our instructions.
        </li>
        <li>
          <strong>Authorities</strong>, when the law requires it or to protect someone’s safety.
        </li>
        <li>
          <strong>A successor</strong>, if the Service changes hands; we would tell you first and
          this policy would continue to apply.
        </li>
      </ul>

      <h2 id="processors">6. Services we rely on and where data is stored</h2>
      <ul>
        <li>
          <strong>Supabase</strong> hosts our database, authentication and uploaded files in the
          European Union (Ireland). It sends the sign-in and confirmation emails.
        </li>
        <li>
          <strong>Vercel</strong> hosts the websites and the API, with our server functions in the
          European Union (Dublin). Vercel’s global network serves static files and sees the IP
          address of each request, as any web host does.
        </li>
      </ul>
      <p>
        Your data is stored in the UK or the European Economic Area. Where a provider processes data
        outside the UK, it does so under the UK International Data Transfer Agreement or the UK
        Addendum to the EU Standard Contractual Clauses, or an adequacy decision.
      </p>

      <h2 id="cookies">7. Cookies and similar technology</h2>
      <p>
        We only set cookies the Service needs to work, so there is no cookie banner. None are used
        for advertising or cross-site tracking.
      </p>
      <ul>
        <li>
          <strong>Sign-in session</strong> (set by our authentication provider): keeps you signed in
          across pages and both hosts. Cleared when you sign out, otherwise refreshed while you keep
          using the Service.
        </li>
        <li>
          <strong>bc-theme</strong>: remembers whether you chose light, dark or system theme.
        </li>
        <li>
          <strong>rally-onboarded, rally-sports, rally-role</strong>: remember that you finished
          Your first-run steps and what you picked, so we do not ask again.
        </li>
        <li>
          <strong>Local storage</strong> on your device may hold a draft or a recently viewed page
          so the app feels quick. It never leaves your device.
        </li>
      </ul>
      <p>You can delete cookies in your browser at any time; you will be signed out.</p>

      <h2 id="retention">8. How long we keep data</h2>
      <ul>
        <li>
          <strong>Your account and profile</strong>: until you delete your account or ask us to.
        </li>
        <li>
          <strong>Club, group and play records</strong>: for as long as the club or group keeps
          them, because results, standings and attendance are the club’s record of what happened.
          When you delete your account your display name on those records is replaced by an
          anonymous label; the results themselves are not rewritten.
        </li>
        <li>
          <strong>Participant records without an account</strong>: until the organiser removes them,
          or in any case after a period of inactivity we will set and publish here before the first
          full season.
        </li>
        <li>
          <strong>Server logs</strong>: up to 30 days. <strong>Audit trail</strong>: up to two
          years, so disputes about a season can be settled.
        </li>
        <li>
          <strong>Backups</strong>: database backups roll over within 30 days of a deletion.
        </li>
      </ul>

      <h2 id="rights">9. Your rights</h2>
      <p>Under UK GDPR you can ask us to:</p>
      <ul>
        <li>tell you what personal data we hold about you and give you a copy;</li>
        <li>correct data that is wrong (you can edit your profile yourself);</li>
        <li>delete your account and personal data, subject to section 8;</li>
        <li>restrict or object to processing based on legitimate interests;</li>
        <li>give you your data in a portable format;</li>
        <li>withdraw consent where consent is the basis.</li>
      </ul>
      <p>
        Email {email} and we will respond within one month. We may ask you to confirm it is you,
        usually by replying from the address on the account. If you are not satisfied, you can
        complain to the Information Commissioner’s Office at{' '}
        <a href="https://ico.org.uk/make-a-complaint/" rel="noreferrer">
          ico.org.uk
        </a>
        .
      </p>

      <h2 id="children">10. Children</h2>
      <p>
        You must be at least {LEGAL.minimumAge} to hold an account. Clubs may run sessions for
        younger players and record them as participants without an account; the club is responsible
        for the parent or guardian consent that this needs. Parent and toddler groups are listed and
        run by adults, and only the adult has an account.
      </p>

      <h2 id="security">11. Security</h2>
      <p>
        Data travels over HTTPS. Access to the database is restricted by row-level policies so that
        each person and club sees only what they are entitled to, and public pages are served from
        filtered copies that contain no contact or profile data. Sign-in links and guest links are
        single-purpose, expire, and are stored only as hashes. No system is perfectly secure; if we
        learn of a breach that affects you we will tell you and the regulator as the law requires.
      </p>

      <h2 id="changes">12. Changes to this policy</h2>
      <p>
        We will update this page when the Service changes, and change the effective date at the top.
        For a change that materially affects you we will also tell you in the app or by email before
        it takes effect.
      </p>

      <h2 id="contact">13. Contact</h2>
      <p>
        {LEGAL.operator}, {email}. Our <Link href="/terms">terms of use</Link> set out the rules for
        using the Service.
      </p>
    </LegalPage>
  );
}
