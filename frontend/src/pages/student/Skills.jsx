import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Async, Button, Card, PageHeader, useToast } from '../../components/ui.jsx';

function ChipEditor({ title, items, setItems, placeholder }) {
  const [text, setText] = useState('');
  const add = () => { const v = text.split(',').map((s) => s.trim()).filter(Boolean); if (v.length) setItems([...new Set([...items, ...v])]); setText(''); };
  return (
    <Card title={title}>
      <div className="chips" style={{ marginBottom: '.75rem' }}>
        {items.length === 0 && <span className="muted">Nothing added yet.</span>}
        {items.map((s) => <span className="chip" key={s}>{s}<button aria-label={`Remove ${s}`} onClick={() => setItems(items.filter((x) => x !== s))}>×</button></span>)}
      </div>
      <div className="row gap-sm">
        <input aria-label={`Add ${title}`} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Button onClick={add}>Add</Button>
      </div>
      <p className="hint">Separate several with commas.</p>
    </Card>
  );
}

export default function Skills() {
  usePageTitle('Skills');
  const toast = useToast();
  const state = useAsync(() => api.get('/student/profile'), []);
  const [skills, setSkills] = useState([]); const [interests, setInterests] = useState([]); const [busy, setBusy] = useState(false);
  useEffect(() => { if (state.data) { setSkills(state.data.profile.skills || []); setInterests(state.data.profile.interests || []); } }, [state.data?.profile?._id]); // eslint-disable-line
  const save = async () => { setBusy(true); try { await api.put('/student/skills', { skills, interests }); toast.success('Skills saved'); } catch (e) { toast.error(e); } finally { setBusy(false); } };
  return (
    <>
      <PageHeader title="Skills & interests" subtitle="Recruiters can filter applicants by skills." actions={<Button variant="primary" loading={busy} onClick={save}>Save</Button>} />
      <Async state={state}>{() => <div className="grid grid-2"><ChipEditor title="Skills" items={skills} setItems={setSkills} placeholder="e.g. Java, React, SQL" /><ChipEditor title="Interests" items={interests} setItems={setInterests} placeholder="e.g. Data engineering" /></div>}</Async>
    </>
  );
}
