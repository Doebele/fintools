// Icons: Iconoir (https://iconoir.com) für die ganze App.
// Exportiert die bisherigen Namen und versteht die Props der alten Aufrufe
// (size, color, strokeWidth, style), damit die Aufrufstellen unverändert bleiben.
// Neue Icons hier ergänzen, nicht direkt aus "iconoir-react" importieren.
// Strichstärke 1,5 laut Pal-Designsystem.
import * as I from "iconoir-react";

const wrap = (Icon) => {
  const C = ({ size = 16, color, strokeWidth = 1.5, ...rest }) => (
    <Icon width={size} height={size} color={color} strokeWidth={strokeWidth} {...rest}/>
  );
  C.displayName = Icon.displayName || Icon.name;
  return C;
};

export const PanelLeft       = wrap(I.SidebarCollapse);
export const LayoutDashboard = wrap(I.ViewGrid);
export const BarChart2       = wrap(I.StatsReport);
export const List            = wrap(I.List);
export const Layers          = wrap(I.Union);
export const GitMerge        = wrap(I.GitMerge);
export const RefreshCw       = wrap(I.Refresh);
export const Settings        = wrap(I.Settings);
export const LogOut          = wrap(I.LogOut);
export const Plus            = wrap(I.Plus);
export const CheckSquare     = wrap(I.CheckSquare);
export const Square          = wrap(I.Square);
export const Pencil          = wrap(I.EditPencil);
export const User            = wrap(I.User);
export const Lock            = wrap(I.Lock);
export const Eye             = wrap(I.Eye);
export const EyeOff          = wrap(I.EyeClosed);
export const Trash2          = wrap(I.Trash);
export const Edit2           = wrap(I.Edit);
export const X               = wrap(I.Xmark);
export const AlertCircle     = wrap(I.WarningCircle);
export const AlertTriangle   = wrap(I.WarningTriangle);
export const ChevronLeft     = wrap(I.NavArrowLeft);
export const Search          = wrap(I.Search);
export const TrendingUp      = wrap(I.GraphUp);
export const FileDown        = wrap(I.Download);
export const Upload          = wrap(I.Upload);
export const FileUp          = wrap(I.Upload);
export const GitFork         = wrap(I.GitFork);
export const Sigma           = wrap(I.SigmaFunction);
export const CalendarDays    = wrap(I.Calendar);
export const Target          = wrap(I.PercentageCircle);
export const PieChart        = wrap(I.PercentageSquare);
export const ArrowLeftRight  = wrap(I.DataTransferBoth);
export const Gauge           = wrap(I.DashboardSpeed);
export const Armchair        = wrap(I.Sofa);
export const Info            = wrap(I.InfoCircle);
export const Clock           = wrap(I.Clock);
export const FileText        = wrap(I.Page);
export const Sun             = wrap(I.SunLight);
export const Moon            = wrap(I.HalfMoon);
export const Globe           = wrap(I.Language);
export const Pin             = wrap(I.Pin);
export const PinOff          = wrap(I.PinSlash);
export const KeyRound        = wrap(I.Key);
