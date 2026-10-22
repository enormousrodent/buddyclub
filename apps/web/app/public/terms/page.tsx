import type { Metadata } from 'next';
import Link from 'next/link';
import { Contents, LegalPage } from '../../../components/legal';
import { LEGAL } from '../../../lib/legal';

export const metadata: Metadata = {
  title: 'Terms of use',
  description:
    'The rules for using Buddy Club: accounts, organisers, content, public boards, acceptable use and liability.',
  alternates: { canonical: '/terms' },
};

const SECTIONS = [
  { id: 'about', label: 'About these terms' },
  { id: 'service', label: 'What the Service is' },
  { id: 'accounts', label: 'Your account' },
  { id: 'organisers', label: 'Organisers, clubs and groups' },
  { id: 'content', label: 'Your content' },
  { id: 'conduct', label: 'Acceptable use' },
  { id: 'public', label: 'Public boards, links and codes' },
  { id: 'results', label: 'Results, standings and disputes' },
  { id: 'meeting', label: 'Meeting in person' },
  { id: 'availability', label: 'Availability and changes' },
  { id: 'liability', label: 'Liability' },
  { id: 'ending', label: 'Ending your account' },
  { id: 'general', label: 'General' },
];

export default function TermsPage() {
  const email = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;
  return (
    <LegalPage
      title="Terms of use"
      lead="These terms govern your use of Buddy Club. By creating an account, joining a group or club, or using a session link or join code, you agree to them."
    >
      <Contents items={SECTIONS} />

      <h2 id="about">1. About these terms</h2>
      <p>
        These terms are a contract between you and <strong>{LEGAL.operator}</strong> (
        <strong>we</strong>, <strong>us</strong>) for the websites and apps at {LEGAL.hosts[0]} and{' '}
        {LEGAL.hosts[1]} (the <strong>Service</strong>). Our{' '}
        <Link href="/privacy">privacy policy</Link> explains how we handle personal data and forms
        part of these terms. If you do not agree, please do not use the Service.
      </p>

      <h2 id="service">2. What the Service is</h2>
      <p>
        <strong>Buddy Club</strong> lets people list and find groups, meetups, clubs and gatherings,
        and say whether they are going. <strong>Sessions</strong> help organisers run play: who is
        in, court rotations and pairings, results, standings, leagues and tournaments. The two share
        one account.
      </p>
      <p>
        We provide the tools. The groups, clubs, sessions and events on the Service are created and
        run by their organisers, not by us. We do not vet organisers, venues or members, and we are
        not a party to any arrangement between you and them.
      </p>

      <h2 id="accounts">3. Your account</h2>
      <ul>
        <li>
          You must be at least {LEGAL.minimumAge} years old to create an account. Younger people can
          take part in a session only when an organiser records them as a participant, with the
          consent of a parent or guardian.
        </li>
        <li>
          Give us a working email address and keep it current; it is how you sign in and how we
          reach you about your account.
        </li>
        <li>
          Keep your sign-in links and any password to yourself. You are responsible for what is done
          with your account until you tell us it has been compromised.
        </li>
        <li>
          One person, one account. Do not impersonate anyone or use a name you are not entitled to.
        </li>
      </ul>

      <h2 id="organisers">4. Organisers, clubs and groups</h2>
      <p>If you create or help run a club, group, session or event, you also agree that:</p>
      <ul>
        <li>
          you are responsible for the club or group: its description, who is admitted, its rules,
          its venue arrangements, its safeguarding and its insurance, if any;
        </li>
        <li>
          when you add people who do not have an account (walk-ins, regulars, juniors), you have a
          proper reason to hold their details, you have told them, and you have any consent that the
          law requires;
        </li>
        <li>
          you will use member contact details only to run the club or group, and not for unrelated
          marketing;
        </li>
        <li>you will remove people who ask to be removed, and correct records that are wrong;</li>
        <li>
          you understand that turning on a public board or sharing a join link or code makes the
          information on it available to anyone who has the link.
        </li>
      </ul>
      <p>
        Where an organiser’s club or group holds data about its members, the club or group decides
        why it is held and we process it for them, as the privacy policy explains.
      </p>

      <h2 id="content">5. Your content</h2>
      <p>
        You keep ownership of what you add to the Service: names, descriptions, pictures, venue
        details, results and messages (<strong>content</strong>). You give us a worldwide,
        royalty-free licence to host, store, copy, display and distribute that content as needed to
        run the Service, including showing it to the people you share it with and, for public groups
        and boards, to the public. The licence ends when the content is deleted, except for copies
        in backups and for records a club keeps under section 8.
      </p>
      <p>
        You confirm you have the right to post your content, including any picture of another
        person, and that it does not break section 6.
      </p>

      <h2 id="conduct">6. Acceptable use</h2>
      <p>Do not use the Service to:</p>
      <ul>
        <li>harass, threaten, abuse or discriminate against anyone;</li>
        <li>post content that is unlawful, defamatory, obscene, or infringes someone’s rights;</li>
        <li>
          collect other people’s details for purposes unrelated to the group or club they joined;
        </li>
        <li>sell or advertise goods and services, unless the group is clearly for that purpose;</li>
        <li>
          try to get round access limits, scrape the Service, probe it for weaknesses, overload it,
          or interfere with other people’s use of it;
        </li>
        <li>create groups or events that do not exist, or misrepresent who is running them.</li>
      </ul>
      <p>
        We may remove content, suspend or close accounts, and take down groups or clubs that break
        these terms. Where reasonable we will tell you why and give you a chance to respond.
      </p>

      <h2 id="public">7. Public boards, links and codes</h2>
      <p>
        Organisers can make a session or event public, generating a board link, a join link or a
        short join code. Anyone with the link can view the board. A join link or code lets a
        signed-in person register or check in; treat them like a door key and only share them with
        the people you mean to admit. Organisers can turn public access off at any time, after which
        the old link stops working. Guest links sent to an individual are for that person only.
      </p>

      <h2 id="results">8. Results, standings and disputes</h2>
      <p>
        Results, standings and rotations are calculated from what organisers and players enter,
        under the rules the organiser chose when the competition was set up. Organisers can correct
        a result and raise or settle a dispute; the Service keeps a record of who changed what. The
        organiser’s decision on a sporting matter is final. We do not guarantee that any result,
        ranking or schedule is correct, and we are not responsible for decisions made on the basis
        of them.
      </p>

      <h2 id="meeting">9. Meeting in person</h2>
      <p>
        The Service brings people together in real places. Use common sense: check the venue, tell
        someone where you are going, and leave if you feel unsafe. Organisers are responsible for
        the activities they run; we are not. If someone behaves badly, tell the organiser and, if it
        involves the Service, tell us at {email}. Call the emergency services if anyone is in
        danger.
      </p>

      <h2 id="availability">10. Availability and changes</h2>
      <p>
        The Service is provided free of charge during its pilot. We aim to keep it available but it
        may be interrupted for maintenance, faults or reasons outside our control, including during
        a live session. Keep a copy of anything you cannot afford to lose. We may change or withdraw
        features, and may introduce paid plans for organisers in future; we will give reasonable
        notice before anything you rely on is withdrawn or charged for.
      </p>

      <h2 id="liability">11. Liability</h2>
      <p>
        Nothing in these terms limits liability for death or personal injury caused by our
        negligence, for fraud, or for anything else that cannot be limited by law. Subject to that:
      </p>
      <ul>
        <li>
          the Service is provided as it is; we make no promise that it will be uninterrupted,
          error-free or suitable for a particular purpose;
        </li>
        <li>
          we are not liable for the acts or omissions of organisers, members, venues or other users,
          for anything that happens at an event, or for content other people post;
        </li>
        <li>
          we are not liable for loss of data, loss of profit, or any indirect or consequential loss;
        </li>
        <li>
          our total liability to you for all claims arising from the Service in any twelve-month
          period is limited to the amount you paid us in that period, or £50 if you paid nothing.
        </li>
      </ul>
      <p>If you are a consumer, nothing in these terms affects your statutory rights.</p>

      <h2 id="ending">12. Ending your account</h2>
      <p>
        You can leave a group or club at any time, and you can ask us to delete your account by
        emailing {email} from the address on the account. Deleting your account removes your profile
        and personal details as the privacy policy describes; results and attendance remain in the
        club’s records under an anonymous label. We may close an account that breaks these terms, or
        that has been inactive for a long time after warning you by email.
      </p>

      <h2 id="general">13. General</h2>
      <ul>
        <li>
          We may update these terms. We will change the effective date at the top and, for a change
          that matters to you, tell you in the app or by email before it takes effect. Continuing to
          use the Service after that date means you accept the new terms.
        </li>
        <li>
          These terms are governed by {LEGAL.governingLaw}, and {LEGAL.courts} have jurisdiction,
          without affecting any mandatory consumer protection you have where you live.
        </li>
        <li>
          If part of these terms is found unenforceable, the rest still applies. If we do not
          enforce a term straight away, we can still do so later.
        </li>
        <li>
          These terms, with the privacy policy, are the whole agreement between you and us about the
          Service.
        </li>
      </ul>
      <p>Questions about these terms: {email}.</p>
    </LegalPage>
  );
}
