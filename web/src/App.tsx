import { useEffect, useState } from "react";
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
  Map,
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
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Package,
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
const nav = [
  { url: "/", text: "Обзор", icon: LayoutGrid },
  { url: "/map", text: "Карта", icon: Map },
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
  { url: "/torrents", text: "Торренты и жалобы", icon: FileText },
];
function Shell() {
  const { data, demo, setDemo, error, loading, refresh, notice } = useStore();
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setMobile(false);
    setSearchOpen(false);
    document.querySelector("main")?.scrollTo(0, 0);
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
  const results = [
    ...data.nodes.map((n) => ({
      id: n.id,
      name: n.name + " · " + n.ip,
      to: "/nodes/" + n.id,
      type: "Нода",
    })),
    ...data.users.map((u) => ({
      id: String(u.id),
      name: String(u.name),
      to: "/users/" + u.id,
      type: "Пользователь",
    })),
  ]
    .filter(
      (r) =>
        query.length > 0 && r.name.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 8);
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
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <Link className="brand" to="/">
          <Activity />
          <span>
            <b>stealthnet-monitor</b>
            <small>Remnawave</small>
          </span>
        </Link>
        <div className="project-picker">
          <Package size={16} />
          <span>Основной проект</span>
          <ChevronDown size={15} />
        </div>
        <nav aria-label="Основная навигация">
          {nav.map((n) => (
            <div key={n.url}>
              {n.section && <div className="nav-section">{n.section}</div>}
              <NavLink end={n.url === "/"} to={n.url}>
                <n.icon size={19} />
                <span>{n.text}</span>
                {n.url === "/incidents" && data.incidents.length > 0 && (
                  <b className="count">
                    {
                      data.incidents.filter((r) => r.status !== "resolved")
                        .length
                    }
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
            className="mobile-menu"
            aria-label="Открыть меню"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            <span>Сеть</span>
            <span>/</span>
            <b>{current}</b>
          </div>
          <div className="global-search">
            <Search size={18} />
            <input
              aria-label="Глобальный поиск"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearchOpen(false);
                if (e.key === "Enter" && results[0]) navigate(results[0].to);
              }}
              placeholder="Поиск ноды, пользователя, IP"
            />
            {searchOpen && query && (
              <div className="search-results">
                {results.map((r) => (
                  <Link key={r.type + r.id} to={r.to}>
                    <span>{r.name}</span>
                    <small>{r.type}</small>
                  </Link>
                ))}
                {!results.length && <p>Совпадений не найдено</p>}
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
            aria-label="Инциденты"
            to="/incidents"
          >
            <Bell size={22} />
            {data.incidents.length > 0 && <i />}
          </Link>
        </header>
        <main id="main" tabIndex={-1}>
          {!demo && error ? (
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
                  <p className="tiny muted">{error}</p>
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
          )}
          <footer className="app-footer">
            <span>
              stealthnet-monitor <b>0.1.0</b>
            </span>
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
