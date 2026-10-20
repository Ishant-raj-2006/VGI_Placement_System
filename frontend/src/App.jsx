import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, ROLE_HOME } from './lib/auth.jsx';
import Layout from './components/Layout.jsx';
import { PageLoader } from './components/ui.jsx';

import Landing from './pages/common/Landing.jsx';
import Login from './pages/common/Login.jsx';
import Register from './pages/common/Register.jsx';
import ForgotPassword from './pages/common/ForgotPassword.jsx';
import ResetPassword from './pages/common/ResetPassword.jsx';
import VerifyEmail from './pages/common/VerifyEmail.jsx';
import Contact from './pages/common/Contact.jsx';
import NotFound from './pages/common/NotFound.jsx';
import Notifications from './pages/common/Notifications.jsx';
import Support from './pages/common/Support.jsx';
import Settings from './pages/common/Settings.jsx';

import SDashboard from './pages/student/Dashboard.jsx';
import SProfile from './pages/student/Profile.jsx';
import SAcademic from './pages/student/Academic.jsx';
import SVerification from './pages/student/Verification.jsx';
import SSkills from './pages/student/Skills.jsx';
import SExperience from './pages/student/Experience.jsx';
import SProjects from './pages/student/Projects.jsx';
import SResumes from './pages/student/Resumes.jsx';
import SDrives from './pages/student/Drives.jsx';
import SDriveDetail from './pages/student/DriveDetail.jsx';
import SApplications from './pages/student/Applications.jsx';
import SApplicationDetail from './pages/student/ApplicationDetail.jsx';
import SInterviews from './pages/student/Interviews.jsx';
import SOffers from './pages/student/Offers.jsx';
import SOfferDetail from './pages/student/OfferDetail.jsx';

import RDashboard from './pages/recruiter/Dashboard.jsx';
import RCompany from './pages/recruiter/Company.jsx';
import RVerification from './pages/recruiter/Verification.jsx';
import RTeam from './pages/recruiter/Team.jsx';
import RDrives from './pages/recruiter/Drives.jsx';
import RDriveForm from './pages/recruiter/DriveForm.jsx';
import RDriveDetail from './pages/recruiter/DriveDetail.jsx';
import RApplicants from './pages/recruiter/Applicants.jsx';
import RApplicantDetail from './pages/recruiter/ApplicantDetail.jsx';
import RRounds from './pages/recruiter/Rounds.jsx';
import RRoundDetail from './pages/recruiter/RoundDetail.jsx';
import RInterviews from './pages/recruiter/Interviews.jsx';
import ROffers from './pages/recruiter/Offers.jsx';

import ADashboard from './pages/admin/Dashboard.jsx';
import AStudents from './pages/admin/Students.jsx';
import AStudentDetail from './pages/admin/StudentDetail.jsx';
import AImport from './pages/admin/ImportStudents.jsx';
import ADuplicates from './pages/admin/Duplicates.jsx';
import ACompanies from './pages/admin/Companies.jsx';
import ACompanyDetail from './pages/admin/CompanyDetail.jsx';
import { PendingDrives, AllDrives } from './pages/admin/Drives.jsx';
import ADriveReview from './pages/admin/DriveReview.jsx';
import { Applications as AApplications, Offers as AOffers, RecruitmentMonitoring } from './pages/admin/Monitoring.jsx';
import AReports from './pages/admin/Reports.jsx';
import APolicies from './pages/admin/Policies.jsx';
import AAudit from './pages/admin/AuditLogs.jsx';
import ATickets from './pages/admin/Tickets.jsx';
import AUsers from './pages/admin/Users.jsx';
import ASystem from './pages/admin/System.jsx';

/** Requires login and one of the given roles; otherwise redirects (not logged in) or shows "access denied". */
function Guard({ roles }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <PageLoader text="Loading your account…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (!roles.includes(user.role)) return <NotFound forbidden />;
  return <Layout />;
}

function SuperOnly({ children }) {
  const { user } = useAuth();
  return user?.role === 'super_admin' ? children : <NotFound forbidden />;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader text="Loading…" />;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={user ? <Navigate to={ROLE_HOME[user.role]} replace /> : <Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/contact" element={<Contact />} />

      <Route path="/student" element={<Guard roles={['student']} />}>
        <Route index element={<SDashboard />} />
        <Route path="profile" element={<SProfile />} />
        <Route path="academic" element={<SAcademic />} />
        <Route path="verification" element={<SVerification />} />
        <Route path="skills" element={<SSkills />} />
        <Route path="experience" element={<SExperience />} />
        <Route path="projects" element={<SProjects />} />
        <Route path="resumes" element={<SResumes />} />
        <Route path="drives" element={<SDrives />} />
        <Route path="drives/:id" element={<SDriveDetail />} />
        <Route path="applications" element={<SApplications />} />
        <Route path="applications/:id" element={<SApplicationDetail />} />
        <Route path="interviews" element={<SInterviews />} />
        <Route path="offers" element={<SOffers />} />
        <Route path="offers/:id" element={<SOfferDetail />} />
        <Route path="notifications" element={<Notifications role="student" />} />
        <Route path="support" element={<Support />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/recruiter" element={<Guard roles={['recruiter']} />}>
        <Route index element={<RDashboard />} />
        <Route path="company" element={<RCompany />} />
        <Route path="verification" element={<RVerification />} />
        <Route path="team" element={<RTeam />} />
        <Route path="drives" element={<RDrives />} />
        <Route path="drives/new" element={<RDriveForm />} />
        <Route path="drives/:id" element={<RDriveDetail />} />
        <Route path="drives/:id/edit" element={<RDriveForm />} />
        <Route path="drives/:id/applicants" element={<RApplicants />} />
        <Route path="drives/:id/rounds" element={<RRounds />} />
        <Route path="drives/:id/interviews" element={<RInterviews />} />
        <Route path="rounds/:id" element={<RRoundDetail />} />
        <Route path="applications/:id" element={<RApplicantDetail />} />
        <Route path="offers" element={<ROffers />} />
        <Route path="notifications" element={<Notifications role="recruiter" />} />
        <Route path="support" element={<Support />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/admin" element={<Guard roles={['tpo', 'super_admin']} />}>
        <Route index element={<ADashboard />} />
        <Route path="recruitment" element={<RecruitmentMonitoring />} />
        <Route path="reports" element={<AReports />} />
        <Route path="students" element={<AStudents />} />
        <Route path="students/import" element={<AImport />} />
        <Route path="students/duplicates" element={<ADuplicates />} />
        <Route path="students/:id" element={<AStudentDetail />} />
        <Route path="companies" element={<ACompanies />} />
        <Route path="companies/:id" element={<ACompanyDetail />} />
        <Route path="drives" element={<AllDrives />} />
        <Route path="drives/pending" element={<PendingDrives />} />
        <Route path="drives/:id" element={<ADriveReview />} />
        <Route path="applications" element={<AApplications />} />
        <Route path="offers" element={<AOffers />} />
        <Route path="policies" element={<APolicies />} />
        <Route path="tickets" element={<ATickets />} />
        <Route path="audit-logs" element={<AAudit />} />
        <Route path="users" element={<SuperOnly><AUsers /></SuperOnly>} />
        <Route path="system" element={<SuperOnly><ASystem /></SuperOnly>} />
        <Route path="notifications" element={<Notifications role="admin" />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
