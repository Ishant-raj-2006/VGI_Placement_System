const has = (v) => v !== undefined && v !== null && v !== '';

/**
 * Profile completion % = completed required sections / required sections.
 * Required sections are configurable (policy.profileRequiredSections); optional fields never block completion.
 * NOTE: 100% completion does NOT imply placement eligibility (eligibility is evaluated per drive).
 */
export function computeCompletion(profile, { user, projectCount = 0, hasResume = false, requiredSections } = {}) {
  const required = requiredSections?.length ? requiredSections : ['personal', 'academic', 'skills', 'projects', 'resume'];
  const e = profile?.academicSummary?.entered || {};
  const complete = {
    personal: !!(user?.name && has(profile?.personal?.contactNumber)),
    academic: !!(
      has(profile?.department) &&
      has(profile?.degree) &&
      has(profile?.graduationYear) &&
      has(e.cgpa) &&
      has(e.activeBacklogs)
    ),
    skills: (profile?.skills?.length || 0) > 0,
    projects: projectCount > 0,
    resume: !!hasResume,
  };
  const done = required.filter((s) => complete[s]).length;
  return {
    percentage: required.length ? Math.round((done / required.length) * 100) : 100,
    sections: Object.fromEntries(required.map((s) => [s, complete[s]])),
    missing: required.filter((s) => !complete[s]),
  };
}
