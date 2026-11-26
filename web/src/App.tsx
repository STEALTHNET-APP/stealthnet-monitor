import { useEffect, useRef, useState } from "react";
import {
  Routes,
  Route,
  NavLink,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  LayoutGrid,
  Map as MapIcon,
  Server,
  ChartNoAxesColumn,
  Users,
  Globe,
  Smartphone,
  TriangleAlert,
  FileText,
  Bell,
  Settings as SettingsIcon,
  Search,
  ChevronRight,
  Menu,
  X,
  LogIn,
  CheckCircle,
} from "lucide-react";
import { Provider, useStore, api } from "./data/store";
import { Overview, MapPage } from "./pages/Overview";
import {
  Nodes,
  Monitoring,
  Traffic,
  People,
  NodeDetail,
  UserDetail,
} from "./pages/Inventory";
import { Incidents, Torrents, ComplaintDetail } from "./pages/Events";
import { Alerts, Settings, AddNode } from "./pages/Settings";
import { Empty } from "./components/ui";
import { matchesCountry, countryName } from "./data/countries";
const nav = [
  { url: "/", text: "Обзор", icon: LayoutGrid },
  { url: "/map", text: "Карта", icon: MapIcon },
  { url: "/nodes", text: "Серверы и ноды", icon: Server },
  { url: "/monitoring", text: "Мониторинг", icon: Activity },
  { url: "/traffic", text: "Трафик", icon: ChartNoAxesColumn },
  { url: "/users", text: "Пользователи", icon: Users, section: "Пользователи" },
  { url: "/connections", text: "Подключения", icon: Globe },
  { url: "/devices", text: "Устройства", icon: Smartphone },
  {
    url: "/incidents",
    text: "Инциденты",
    icon: TriangleAlert,
    section: "События",
  },
  { url: "/torrents", text: "Торренты", icon: FileText },
];
function Shell() {
  const { data, demo, setDemo, error, needsLogin, loading, refresh, notice } =
    useStore();
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const searchTerm = query.trim();
  const [searchOpen, setSearchOpen] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const closeMenu = useRef<HTMLButtonElement>(null);
  const [searchUsers, setSearchUsers] = useState<
    { id: string; name: string }[]
  >([]);
  const [searchStatus, setSearchStatus] = useState("");
  useEffect(() => {
    setSearchUsers([]);
    setSearchStatus("");
    if (demo || !searchOpen || !searchTerm || needsLogin) return;
    const controller = new AbortController();
    setSearchStatus("Поиск…");
    const timer = setTimeout(() => {
      api<{ rows: { id: string; name: string }[] }>(
        "/inventory/user?limit=8&q=" + encodeURIComponent(searchTerm),
        { signal: controller.signal },
      )
        .then((v) => {
          setSearchUsers(v.rows);
          setSearchStatus("");
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSearchUsers([]);
            setSearchStatus("Не удалось выполнить поиск");
          }
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm, demo, searchOpen, needsLogin]);
  useEffect(() => {
    if (!mobile) return;
    closeMenu.current?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobile(false);
        menu.current?.focus();
      }
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [mobile]);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setMobile(false);
    setSearchOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const current =
    nav.find((n) =>
      n.url === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(n.url),
    )?.text ||
    (location.pathname.startsWith("/settings")
      ? "Настройки"
      : location.pathname.startsWith("/alerts")
        ? "Оповещения"
        : location.pathname === "/add-server"
          ? "Добавить сервер"
          : "Подробности");
  const activeIncidents = data.incidents.filter(
    (r) => r.status !== "resolved",
  ).length;
  const nodeCountries = new Map(
    data.nodes.filter((n) => n.code !== "xx").map((n) => [n.code, n.country]),
  );
  const results = searchTerm
    ? [
        ...data.nodes
          .filter((n) =>
            `${n.name} ${n.ip}`
              .toLowerCase()
              .includes(searchTerm.toLowerCase()),
          )
          .map((n) => ({
            id: n.id,
            name: n.name + " · " + n.ip,
            to: "/nodes/" + n.id,
            type: "Нода",
          })),
        ...[...nodeCountries]
          .filter(([code, name]) => matchesCountry(searchTerm, code, name))
          .map(([code]) => ({
            id: code,
            name: countryName(code),
            to: "/nodes?country=" + encodeURIComponent(code),
            type: "Страна",
          })),
        ...(demo
          ? data.users.filter((u) =>
              String(u.name).toLowerCase().includes(searchTerm.toLowerCase()),
            )
          : searchUsers
        ).map((u) => ({
          id: String(u.id),
          name: String(u.name),
          to: "/users/" + u.id,
          type: "Пользователь",
        })),
      ].slice(0, 8)
    : [];
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/session", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      setLoginError("");
      await refresh();
    } catch (e) {
      setLoginError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      {mobile && (
        <div
          className="sidebar-scrim"
          onClick={() => {
            setMobile(false);
            menu.current?.focus();
          }}
        />
      )}
      <aside id="sidebar" className={"sidebar " + (mobile ? "open" : "")}>
        <Link className="brand" to="/">
          <Activity />
          <span>
            <b>stealthnet-monitor</b>
            <small>Remnawave</small>
          </span>
        </Link>
        <button
          ref={closeMenu}
          className="sidebar-close"
          aria-label="Закрыть меню"
          onClick={() => {
            setMobile(false);
            menu.current?.focus();
          }}
        >
          <X size={20} />
        </button>
        <nav aria-label="Основная навигация">
          {nav.map((n) => (
            <div key={n.url}>
              {n.section && <div className="nav-section">{n.section}</div>}
              <NavLink end={n.url === "/"} to={n.url}>
                <n.icon size={19} />
                <span>{n.text}</span>
                {n.url === "/incidents" && activeIncidents > 0 && (
                  <b
                    className="count"
                    aria-label={`Активных инцидентов: ${activeIncidents}`}
                  >
                    {activeIncidents}
                  </b>
                )}
              </NavLink>
            </div>
          ))}
        </nav>
        <nav className="bottom-nav" aria-label="Настройки">
          <NavLink to="/alerts">
            <Bell size={19} />
            Оповещения
          </NavLink>
          <NavLink to="/settings">
            <SettingsIcon size={19} />
            Настройки
          </NavLink>
        </nav>
        <Link to="/settings?tab=access" className="account">
          <span className="avatar">
            А<i />
          </span>
          <span>Администратор</span>
          <ChevronRight size={16} />
        </Link>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            ref={menu}
            className="mobile-menu"
            aria-label="Открыть меню"
            aria-controls="sidebar"
            aria-expanded={mobile}
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            <span>Сеть</span>
            <span>/</span>
            <b>{current}</b>
          </div>
          <div
            className="global-search"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setSearchOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSearchOpen(false);
            }}
          >
            <Search size={18} aria-hidden="true" />
            <input
              aria-label="Глобальный поиск"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchOpen && results[0]) {
                  navigate(results[0].to);
                  setSearchOpen(false);
                }
              }}
              placeholder="Нода, страна, пользователь или IP"
            />
            {searchOpen && searchTerm && (
              <div className="search-results">
                {results.map((r) => (
                  <Link
                    key={r.type + r.id}
                    to={r.to}
                    onClick={() => setSearchOpen(false)}
                  >
                    <span>{r.name}</span>
                    <small>{r.type}</small>
                  </Link>
                ))}
                {searchStatus && !demo ? (
                  <p role="status">{searchStatus}</p>
                ) : (
                  !results.length && <p>Совпадений не найдено</p>
                )}
                <Link
                  to={"/connections?q=" + encodeURIComponent(searchTerm)}
                  onClick={() => setSearchOpen(false)}
                >
                  Искать среди подключений →
                </Link>
              </div>
            )}
          </div>
          <button
            className={"mode-badge " + (!demo ? "live" : "")}
            title="Переключить источник данных"
            onClick={() => setDemo(!demo)}
          >
            {demo ? "Демо-данные" : "Рабочий режим"}
          </button>
          <Link
            className="notification-bell"
            aria-label={
              activeIncidents
                ? `Активных инцидентов: ${activeIncidents}`
                : "Инциденты"
            }
            to="/incidents"
          >
            <Bell size={22} />
            {activeIncidents > 0 && <i />}
          </Link>
        </header>
        <main id="main" tabIndex={-1}>
          {!demo && needsLogin ? (
            <div className="login-wrap">
              <div className="panel login-panel">
                <Activity className="mint" size={42} />
                <h1>Рабочая панель</h1>
                <p className="muted">
                  Войдите с паролем владельца, указанным при установке.
                </p>
                <form onSubmit={login}>
                  <label>
                    Пароль
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  {loginError && (
                    <p role="alert" className="red">
                      {loginError}
                    </p>
                  )}
                  <button className="button primary full" disabled={busy}>
                    <LogIn size={18} />
                    {busy ? "Вход…" : "Войти"}
                  </button>
                </form>
                <button className="button full" onClick={() => setDemo(true)}>
                  Посмотреть демо
                </button>
              </div>
            </div>
          ) : loading && !data.updated_at ? (
            <div className="skeleton-page" aria-label="Загрузка данных">
              <div />
              <div />
              <div />
            </div>
          ) : (
            <>
              {!demo && error && (
                <div className="panel connection-warning" role="status">
                  <div>
                    <b>Не удалось обновить данные</b>
                    <p className="muted">
                      {data.updated_at
                        ? "Показаны последние полученные данные."
                        : error}
                    </p>
                  </div>
                  <button
                    className="button"
                    disabled={loading}
                    onClick={() => void refresh()}
                  >
                    Повторить
                  </button>
                </div>
              )}
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/map" element={<MapPage />} />
                <Route path="/nodes" element={<Nodes />} />
                <Route path="/nodes/:id" element={<NodeDetail />} />
                <Route path="/monitoring" element={<Monitoring />} />
                <Route path="/traffic" element={<Traffic />} />
                <Route path="/users" element={<People />} />
                <Route path="/users/:id" element={<UserDetail />} />
                <Route
                  path="/connections"
                  element={<People key="connections" kind="connections" />}
                />
                <Route
                  path="/devices"
                  element={<People key="devices" kind="devices" />}
                />
                <Route path="/incidents" element={<Incidents />} />
                <Route path="/torrents" element={<Torrents />} />
                <Route path="/complaints/:id" element={<ComplaintDetail />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/add-server" element={<AddNode />} />
                <Route
                  path="*"
                  element={
                    <Empty
                      title="Страница не найдена"
                      action={<Link to="/">На главную</Link>}
                    />
                  }
                />
              </Routes>
            </>
          )}
          <footer className="app-footer">
            <span>
              stealthnet-monitor <b>0.1.6</b>
            </span>
            {!demo && (data.geoip?.available || data.geoip?.asn_available) && (
              <a href="https://db-ip.com" target="_blank" rel="noreferrer">
                IP Geolocation by DB-IP
              </a>
            )}
            <span>
              {demo
                ? "Демонстрационные данные"
                : "Автообновление каждые 15 секунд"}
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle size={19} />
          {notice}
        </div>
      )}
    </div>
  );
}
export default function App() {
  return (
    <Provider>
      <Shell />
    </Provider>
  );
}
