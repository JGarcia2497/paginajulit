import { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '../services/authService';
import { sessionService } from '../services/session';
import { db } from '../config/firebase';
import { doc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { Spinner } from '../components/ui/Spinner';
import { isOwnerEmail } from '../config/roles';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authState, setAuthState] = useState('loading'); // 'loading', 'pending-profile', 'ready', 'no-profile', 'error'

  const login = authService.login;
  const loginWithGoogle = authService.loginWithGoogle;
  const register = authService.register;
  const logout = authService.logout;
  const resetPassword = authService.resetPassword;

  useEffect(() => {
    let unsubscribeProfile = null;
    // Si tras unos segundos sigue sin existir users/{uid}, la cuenta se ha
    // eliminado desde Gestión de Usuarios: se avisa en vez de dejar la
    // pantalla de carga para siempre. La espera deja margen al registro,
    // que crea el perfil justo después de crear el usuario.
    let noProfileTimer = null;
    const clearNoProfileTimer = () => {
      if (noProfileTimer) { clearTimeout(noProfileTimer); noProfileTimer = null; }
    };

    const unsubscribeAuth = authService.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      clearNoProfileTimer();

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (user) {
        setAuthState('pending-profile');
        
        // 1. BOOTSTRAP AUTOMÁTICO DE OWNER
        if (isOwnerEmail(user.email)) {
          try {
            const profileRef = doc(db, 'users', user.uid);
            const snap = await getDoc(profileRef);
            let needsUpdate = false;
            let dataToSet = {
              uid: user.uid,
              email: user.email,
              role: 'owner',
              status: 'active',
              organizationId: 'julit',
              updatedAt: new Date().toISOString()
            };

            if (!snap.exists()) {
              dataToSet.fullName = user.displayName || 'Owner';
              dataToSet.clientId = null;
              dataToSet.createdAt = new Date().toISOString();
              needsUpdate = true;
            } else {
              const data = snap.data();
              if (data.role !== 'owner' || data.status !== 'active' || data.organizationId !== 'julit') {
                needsUpdate = true;
              }
            }

            if (needsUpdate) {
              await setDoc(profileRef, dataToSet, { merge: true });
            }

            const orgRef = doc(db, 'organizations', 'julit');
            const orgSnap = await getDoc(orgRef);
            if (!orgSnap.exists()) {
              await setDoc(orgRef, {
                id: 'julit',
                name: 'Julit',
                ownerId: user.uid,
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
            }
          } catch (err) {
            console.error("Error en bootstrap de owner:", err);
          }
        }

        // 2. SUSCRIPCIÓN NORMAL A PERFIL
        unsubscribeProfile = onSnapshot(
          doc(db, 'users', user.uid),
          (docSnap) => {
            if (docSnap.exists()) {
              clearNoProfileTimer();
              const profile = docSnap.data();
              setUserProfile(profile);
              sessionService.setSession(user, profile.organizationId, profile.role, profile.clientId || null);
              setAuthState('ready');
            } else {
              // Wait for authService.register to create it
              setUserProfile(null);
              sessionService.setSession(user, null, null);
              setAuthState('pending-profile');
              if (!noProfileTimer) {
                noProfileTimer = setTimeout(() => setAuthState('no-profile'), 6000);
              }
            }
          },
          (error) => {
            console.error("Error subscribing to user profile:", error);
            setAuthState('error');
          }
        );
      } else {
        setUserProfile(null);
        sessionService.setSession(null, null, null);
        setAuthState('ready');
      }
    });

    return () => {
      clearNoProfileTimer();
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const value = {
    currentUser,
    userProfile,
    login,
    loginWithGoogle,
    register,
    logout,
    resetPassword
  };

  if (authState === 'loading' || authState === 'pending-profile') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#09090b', color: '#fff' }}>
        <Spinner size={32} />
        <span style={{ marginLeft: '12px' }}>Cargando sesión...</span>
      </div>
    );
  }

  if (authState === 'no-profile') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#09090b', color: '#fff', textAlign: 'center', padding: '0 16px' }}>
        <p>Esta cuenta ya no tiene acceso a la app. Si crees que es un error, habla con tu entrenador.</p>
        <button onClick={logout} style={{ padding: '8px 16px', cursor: 'pointer' }}>Cerrar sesión</button>
      </div>
    );
  }

  if (authState === 'error') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#09090b', color: '#fca5a5' }}>
        <p>Error al cargar el perfil del usuario. Por favor, recarga la página o cierra sesión.</p>
        <button onClick={logout} style={{ marginLeft: '12px', padding: '8px', cursor: 'pointer' }}>Cerrar Sesión</button>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
