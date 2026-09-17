"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { IconTrash } from "@/components/Icons";

type Tab = "filaments" | "printers" | "supplies";

type Material = {
  id: string;
  name: string;
  brand: string;
  type: string;
  color: string;
  costPerKg: number;
  unitPrice: number;
  unitWeightGrams: number;
  stockGrams: number;
  lowStockThresholdGrams: number;
  purchaseDate: string | null;
  purchaseLink: string;
  active: boolean;
};

type Printer = {
  id: string;
  model: string;
  purchasePrice: number;
  powerWatts: number;
  usefulLifeHours: number;
  maintenancePerHour: number;
  purchaseDate: string | null;
  purchaseLink: string;
  active: boolean;
};

type Supply = {
  id: string;
  name: string;
  category: string;
  unitCost: number;
  purchaseDate: string | null;
  purchaseLink: string;
  active: boolean;
};

const filamentTypes = ["PLA", "PETG", "ABS", "TPU", "ASA", "Resina", "Outro"];
const supplyCategories = ["Chaveiros & Ferragens", "Embalagem & Caixas", "Hardware & Parafusos", "Acabamento & Lixa", "Brindes & Tags", "Lâmpada LED", "Outros"];

const emptyFilament = { name: "", brand: "", type: "PLA", color: "", unitPrice: "", unitWeightGrams: "1000", stockGrams: "1000", lowStockThresholdGrams: "200", purchaseDate: "", purchaseLink: "" };
const emptyPrinter = { model: "", purchasePrice: "", powerWatts: "160", usefulLifeHours: "5000", maintenancePerHour: "0,60", purchaseDate: "", purchaseLink: "" };
const emptySupply = { name: "", category: supplyCategories[1], unitCost: "", purchaseDate: "", purchaseLink: "" };

function money(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function numberValue(value: string) {
  const cleanValue = value.replace(/R\$\s?/g, "").replace(/\s/g, "");
  const normalized = cleanValue.includes(",")
    ? cleanValue.replace(/\./g, "").replace(",", ".")
    : cleanValue;
  return Number(normalized) || 0;
}

function currencyInput(value: string) {
  const numericValue = numberValue(value);
  return numericValue ? `R$ ${numericValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
}

function editingCurrency(value: string) {
  return value.replace(/^R\$\s?/, "");
}

function dateValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("filaments");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [filament, setFilament] = useState(emptyFilament);
  const [printer, setPrinter] = useState(emptyPrinter);
  const [supply, setSupply] = useState(emptySupply);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [authEmail, setAuthEmail] = useState("silaratur@gmail.com");
  const [authPassword, setAuthPassword] = useState("Minima.3D");
  const [authFeedback, setAuthFeedback] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((token) => token + 1);

  useEffect(() => {
    async function loadLibrary() {
      setLoading(true);
      const [materialResponse, printerResponse, supplyResponse] = await Promise.all([
        fetch("/api/materials"),
        fetch("/api/printers"),
        fetch("/api/supplies"),
      ]);

      const needsLogin = [materialResponse, printerResponse, supplyResponse].some((response) => response.status === 401);
      setAuthRequired(needsLogin);

      if (materialResponse.ok) setMaterials((await materialResponse.json()) as Material[]);
      if (printerResponse.ok) setPrinters((await printerResponse.json()) as Printer[]);
      if (supplyResponse.ok) setSupplies((await supplyResponse.json()) as Supply[]);
      setLoading(false);
    }
    void loadLibrary();
  }, [reloadToken]);

  async function save(endpoint: string, body: object, success: string) {
    setFeedback("");
    const requestUrl = editingId ? `${endpoint}?id=${encodeURIComponent(editingId)}` : endpoint;
    const response = await fetch(requestUrl, {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 401) {
        setAuthRequired(true);
        setFeedback("Faça login para salvar presets na biblioteca.");
      } else {
        const errorData = await response.json().catch(() => null);
        setFeedback(errorData?.error?.fieldErrors ? "Confira os campos e tente novamente." : "Não foi possível salvar este preset.");
      }
      return false;
    }

    setFeedback(success);
    setEditingId(null);
    reload();
    return true;
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setAuthFeedback("");
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: authEmail, password: authPassword }),
    });

    if (!response.ok) {
      setAuthFeedback("E-mail ou senha inválidos.");
      return;
    }

    setAuthRequired(false);
    setAuthFeedback("");
    setFeedback("Sessão iniciada. Você pode salvar o preset agora.");
    reload();
  }

  async function deletePreset(endpoint: string, id: string) {
    if (!window.confirm("Desativar este preset? O histórico será preservado.")) return;
    const response = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) reload();
  }

  function editPreset(kind: Tab, item: Material | Printer | Supply) {
    setTab(kind);
    setEditingId(item.id);
    if (kind === "filaments") {
      const material = item as Material;
      setFilament({ name: material.name, brand: material.brand, type: material.type, color: material.color, unitPrice: currencyInput(String(material.unitPrice)), unitWeightGrams: String(material.unitWeightGrams), stockGrams: String(material.stockGrams), lowStockThresholdGrams: String(material.lowStockThresholdGrams), purchaseDate: dateValue(material.purchaseDate), purchaseLink: material.purchaseLink });
    } else if (kind === "printers") {
      const printerItem = item as Printer;
      setPrinter({ model: printerItem.model, purchasePrice: currencyInput(String(printerItem.purchasePrice)), powerWatts: String(printerItem.powerWatts), usefulLifeHours: String(printerItem.usefulLifeHours), maintenancePerHour: currencyInput(String(printerItem.maintenancePerHour)), purchaseDate: dateValue(printerItem.purchaseDate), purchaseLink: printerItem.purchaseLink });
    } else {
      const supplyItem = item as Supply;
      setSupply({ name: supplyItem.name, category: supplyItem.category, unitCost: currencyInput(String(supplyItem.unitCost)), purchaseDate: dateValue(supplyItem.purchaseDate), purchaseLink: supplyItem.purchaseLink });
    }
    setFeedback("Editando preset. Salve para aplicar as alterações.");
  }

  async function submitFilament(event: FormEvent) {
    event.preventDefault();
    const price = numberValue(filament.unitPrice);
    const weight = numberValue(filament.unitWeightGrams) || 1000;
    const saved = await save("/api/materials", {
      name: filament.name,
      brand: filament.brand,
      type: filament.type,
      color: filament.color,
      unitPrice: price,
      unitWeightGrams: weight,
      costPerKg: (price / weight) * 1000,
      stockGrams: numberValue(filament.stockGrams),
      lowStockThresholdGrams: numberValue(filament.lowStockThresholdGrams) || 200,
      purchaseDate: filament.purchaseDate || null,
      purchaseLink: filament.purchaseLink,
      active: true,
    }, "Filamento salvo na biblioteca.");
    if (saved) setFilament(emptyFilament);
  }

  async function submitPrinter(event: FormEvent) {
    event.preventDefault();
    const saved = await save("/api/printers", {
      model: printer.model,
      purchasePrice: numberValue(printer.purchasePrice),
      powerWatts: numberValue(printer.powerWatts),
      usefulLifeHours: numberValue(printer.usefulLifeHours),
      maintenancePerHour: numberValue(printer.maintenancePerHour),
      purchaseDate: printer.purchaseDate || null,
      purchaseLink: printer.purchaseLink,
      active: true,
    }, "Impressora salva na biblioteca.");
    if (saved) setPrinter(emptyPrinter);
  }

  async function submitSupply(event: FormEvent) {
    event.preventDefault();
    const saved = await save("/api/supplies", {
      name: supply.name,
      category: supply.category,
      unitCost: numberValue(supply.unitCost),
      purchaseDate: supply.purchaseDate || null,
      purchaseLink: supply.purchaseLink,
      active: true,
    }, "Insumo salvo na biblioteca.");
    if (saved) setSupply(emptySupply);
  }

  const tabs = [
    { id: "filaments" as const, label: "Filamentos", count: materials.length, icon: "◉" },
    { id: "printers" as const, label: "Impressoras", count: printers.length, icon: "▣" },
    { id: "supplies" as const, label: "Insumos", count: supplies.length, icon: "◇" },
  ];

  return (
    <main className="admin-shell">
      <AdminHeader active="library" />

      <div className="admin-content">
        <section className="library-heading">
          <div>
            <h1>Biblioteca de Presets</h1>
            <p>Cadastre seus filamentos, impressoras e insumos para acelerar a precificação</p>
          </div>
          <div className="preset-tabs">
            {tabs.map((item) => (
              <button key={item.id} className={tab === item.id ? "selected" : ""} onClick={() => { setTab(item.id); setFeedback(""); }}>
                <span>{item.icon}</span> {item.label} <strong>({item.count})</strong>
              </button>
            ))}
          </div>
        </section>

        {loading ? <div className="library-loading">Carregando biblioteca...</div> : null}

        {authRequired ? (
          <form className="admin-auth-banner" onSubmit={handleLogin}>
            <div>
              <strong>Entre para salvar seus presets</strong>
              <p>A biblioteca exige uma sessão autenticada para criar ou excluir registros.</p>
            </div>
            <input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} type="email" placeholder="E-mail" />
            <input value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} type="password" placeholder="Senha" />
            <button className="primary-button" type="submit">Entrar e continuar</button>
            {authFeedback ? <span className="admin-auth-error">{authFeedback}</span> : null}
          </form>
        ) : null}

        {tab === "filaments" ? (
          <section className="library-layout">
            <form className="preset-form" onSubmit={submitFilament}>
              <h2><span>＋</span> {editingId ? "Editar Filamento" : "Cadastrar Novo Filamento"}</h2>
              <label>Nome / Descrição<input required value={filament.name} onChange={(event) => setFilament({ ...filament, name: event.target.value })} placeholder="Ex: PLA Terracota Silk" /></label>
              <div className="form-grid">
                <label>Marca<input value={filament.brand} onChange={(event) => setFilament({ ...filament, brand: event.target.value })} placeholder="Ex: AC3D" /></label>
                <label>Material<select value={filament.type} onChange={(event) => setFilament({ ...filament, type: event.target.value })}>{filamentTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              </div>
              <div className="form-grid">
                <label>Preço R$<input required inputMode="decimal" value={filament.unitPrice} onFocus={(event) => setFilament({ ...filament, unitPrice: editingCurrency(event.target.value) })} onBlur={(event) => setFilament({ ...filament, unitPrice: currencyInput(event.target.value) })} onChange={(event) => setFilament({ ...filament, unitPrice: event.target.value })} placeholder="R$ 120,00" /></label>
                <label>Peso (g)<input required inputMode="numeric" value={filament.unitWeightGrams} onChange={(event) => setFilament({ ...filament, unitWeightGrams: event.target.value })} placeholder="1000" /></label>
              </div>
              <div className="form-grid">
                <label>Cor<input value={filament.color} onChange={(event) => setFilament({ ...filament, color: event.target.value })} placeholder="Ex: Vermelho" /></label>
                <label>Estoque (g)<input inputMode="numeric" value={filament.stockGrams} onChange={(event) => setFilament({ ...filament, stockGrams: event.target.value })} placeholder="1000" /></label>
              </div>
              <div className="form-grid">
                <label>Avisar com estoque abaixo de (g)<input inputMode="numeric" value={filament.lowStockThresholdGrams} onChange={(event) => setFilament({ ...filament, lowStockThresholdGrams: event.target.value })} placeholder="200" /></label>
                <label>Data da Compra<input type="date" value={filament.purchaseDate} onChange={(event) => setFilament({ ...filament, purchaseDate: event.target.value })} /></label>
              </div>
              <label>Link da Compra<input type="url" value={filament.purchaseLink} onChange={(event) => setFilament({ ...filament, purchaseLink: event.target.value })} placeholder="https://loja.com/produto" /></label>
              <div className="form-actions"><button className="primary-button" type="submit">{editingId ? "Atualizar Filamento" : "Salvar na Biblioteca"}</button>{editingId ? <button className="secondary-button" type="button" onClick={() => { setEditingId(null); setFilament(emptyFilament); }}>Cancelar</button> : null}</div>
            </form>
            <div className="preset-grid">
              {materials.map((item) => {
                const lowStock = item.stockGrams <= item.lowStockThresholdGrams;
                return (
                  <article className={lowStock ? "preset-card low-stock" : "preset-card"} key={item.id}>
                    <div className="card-top">
                      <span className="material-badge">{item.type}</span>
                      <span className="card-actions">
                        <button className="edit-button" onClick={() => editPreset("filaments", item)}>Editar</button>
                        <button className="delete-button" onClick={() => deletePreset("/api/materials", item.id)} aria-label={`Excluir ${item.name}`}><IconTrash className="nav-icon" /></button>
                      </span>
                    </div>
                    <h3>{item.name}</h3>
                    <p>Marca: {item.brand || "Genérico"} {item.color ? `| ${item.color}` : ""}</p>
                    <strong>{money(item.unitPrice || item.costPerKg)} <small>({item.unitWeightGrams}g)</small></strong>
                    <p className="card-detail">
                      {money((item.unitPrice || item.costPerKg) / Math.max(item.unitWeightGrams, 1))}/g · Estoque: {item.stockGrams}g
                      {lowStock ? <span className="low-stock-badge">Estoque baixo</span> : null}
                    </p>
                    <p className="card-detail">Compra: {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString("pt-BR") : "não informada"} {item.purchaseLink ? <a href={item.purchaseLink} target="_blank" rel="noreferrer">Abrir link</a> : null}</p>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {tab === "printers" ? (
          <section className="library-layout">
            <form className="preset-form" onSubmit={submitPrinter}>
              <h2><span>＋</span> {editingId ? "Editar Impressora" : "Cadastrar Nova Impressora"}</h2>
              <label>Modelo da Impressora<input required value={printer.model} onChange={(event) => setPrinter({ ...printer, model: event.target.value })} placeholder="Ex: Bambu Lab P1S" /></label>
              <div className="form-grid"><label>Valor Pago R$<input required inputMode="decimal" value={printer.purchasePrice} onFocus={(event) => setPrinter({ ...printer, purchasePrice: editingCurrency(event.target.value) })} onBlur={(event) => setPrinter({ ...printer, purchasePrice: currencyInput(event.target.value) })} onChange={(event) => setPrinter({ ...printer, purchasePrice: event.target.value })} placeholder="R$ 3.500,00" /></label><label>Potência (W)<input required inputMode="numeric" value={printer.powerWatts} onChange={(event) => setPrinter({ ...printer, powerWatts: event.target.value })} /></label></div>
              <div className="form-grid"><label>Vida Útil (Horas)<input required inputMode="numeric" value={printer.usefulLifeHours} onChange={(event) => setPrinter({ ...printer, usefulLifeHours: event.target.value })} /></label><label>Manut. R$/Hora<input required inputMode="decimal" value={printer.maintenancePerHour} onFocus={(event) => setPrinter({ ...printer, maintenancePerHour: editingCurrency(event.target.value) })} onBlur={(event) => setPrinter({ ...printer, maintenancePerHour: currencyInput(event.target.value) })} onChange={(event) => setPrinter({ ...printer, maintenancePerHour: event.target.value })} placeholder="R$ 0,60" /></label></div>
              <div className="form-grid"><label>Data da Compra<input type="date" value={printer.purchaseDate} onChange={(event) => setPrinter({ ...printer, purchaseDate: event.target.value })} /></label><label>Link da Compra<input type="url" value={printer.purchaseLink} onChange={(event) => setPrinter({ ...printer, purchaseLink: event.target.value })} placeholder="https://loja.com/produto" /></label></div>
              <div className="form-actions"><button className="primary-button" type="submit">{editingId ? "Atualizar Impressora" : "Salvar Impressora"}</button>{editingId ? <button className="secondary-button" type="button" onClick={() => { setEditingId(null); setPrinter(emptyPrinter); }}>Cancelar</button> : null}</div>
            </form>
            <div className="preset-grid printer-grid">
              {printers.map((item) => { const hourly = item.purchasePrice / item.usefulLifeHours + item.maintenancePerHour; return <article className="preset-card" key={item.id}><div className="card-top"><span className="material-badge printer-badge">Impressora</span><span className="card-actions"><button className="edit-button" onClick={() => editPreset("printers", item)}>Editar</button><button className="delete-button" onClick={() => deletePreset("/api/printers", item.id)} aria-label={`Excluir ${item.model}`}><IconTrash className="nav-icon" /></button></span></div><h3>{item.model}</h3><p>Valor {money(item.purchasePrice)} | Potência {item.powerWatts}W</p><p>Vida útil: {item.usefulLifeHours}h | Manut.: {money(item.maintenancePerHour)}/h</p><strong className="cost-pill">Custo máquina: {money(hourly)}/hora</strong><p className="card-detail">Compra: {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString("pt-BR") : "não informada"} {item.purchaseLink ? <a href={item.purchaseLink} target="_blank" rel="noreferrer">Abrir link</a> : null}</p></article>; })}
            </div>
          </section>
        ) : null}

        {tab === "supplies" ? (
          <section className="library-layout">
            <form className="preset-form" onSubmit={submitSupply}>
              <h2><span>＋</span> {editingId ? "Editar Preset de Insumo" : "Cadastrar Preset de Insumo"}</h2>
              <label>Nome do Insumo<input required value={supply.name} onChange={(event) => setSupply({ ...supply, name: event.target.value })} placeholder="Ex: Argola de Chaveiro c/ Corrente" /></label>
              <label>Categoria<select value={supply.category} onChange={(event) => setSupply({ ...supply, category: event.target.value })}>{supplyCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label>Custo Unitário (R$)<input required inputMode="decimal" value={supply.unitCost} onFocus={(event) => setSupply({ ...supply, unitCost: editingCurrency(event.target.value) })} onBlur={(event) => setSupply({ ...supply, unitCost: currencyInput(event.target.value) })} onChange={(event) => setSupply({ ...supply, unitCost: event.target.value })} placeholder="R$ 0,35" /></label>
              <div className="form-grid"><label>Data da Compra<input type="date" value={supply.purchaseDate} onChange={(event) => setSupply({ ...supply, purchaseDate: event.target.value })} /></label><label>Link da Compra<input type="url" value={supply.purchaseLink} onChange={(event) => setSupply({ ...supply, purchaseLink: event.target.value })} placeholder="https://loja.com/produto" /></label></div>
              <div className="form-actions"><button className="primary-button" type="submit">{editingId ? "Atualizar Insumo" : "Salvar Insumo Preset"}</button>{editingId ? <button className="secondary-button" type="button" onClick={() => { setEditingId(null); setSupply(emptySupply); }}>Cancelar</button> : null}</div>
            </form>
            <div className="preset-grid">
              {supplies.map((item) => <article className="preset-card" key={item.id}><div className="card-top"><span className="material-badge supply-badge">{item.category}</span><span className="card-actions"><button className="edit-button" onClick={() => editPreset("supplies", item)}>Editar</button><button className="delete-button" onClick={() => deletePreset("/api/supplies", item.id)} aria-label={`Excluir ${item.name}`}><IconTrash className="nav-icon" /></button></span></div><h3>{item.name}</h3><p>Categoria: {item.category}</p><strong>{money(item.unitCost)} <small>por unidade</small></strong><p className="card-detail">Compra: {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString("pt-BR") : "não informada"} {item.purchaseLink ? <a href={item.purchaseLink} target="_blank" rel="noreferrer">Abrir link</a> : null}</p></article>)}
            </div>
          </section>
        ) : null}

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}
      </div>
    </main>
  );
}
