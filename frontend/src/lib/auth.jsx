import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, setUnauthorizedHandler } from './api.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export const ROLE_HOME = { student: '/student', recruiter: '/recruiter', tpo: '/admin', super_admin: '/admin' };

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: !!tokenStore.get(), user: null, profile: null, company: null, membership: null });

  const apply = (d) => setState({ loading: false, user: d?.user || null, profile: d?.profile || null, company: d?.company || null, membership: d?.membership || null });

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { apply(null); return null; }
    try { const { data } = await api.get('/auth/me', undefined, { noAuthRedirect: true }); apply(data); return data; }
    catch { tokenStore.set(null); apply(null); return null; }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    setUnauthorizedHandler(() => { tokenStore.set(null); apply(null); });
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password }, { noAuthRedirect: true });
    tokenStore.set(data.token);
    apply(data);
    return data;
  };
  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* token may already be invalid */ }
    tokenStore.set(null); apply(null);
  };

  const value = useMemo(() => ({ ...state, login, logout, refresh, isRole: (...r) => r.includes(state.user?.role) }), [state, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
