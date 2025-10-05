import os, json
from typing import TypedDict
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from openai import OpenAI

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = os.getenv("MODEL", "gpt-5-codex")


def _mcp_server_url(label: str, default_port: int) -> str:
    env_var = f"{label.upper()}_MCP_URL"
    explicit = os.getenv(env_var)
    if explicit:
        return explicit
    base = os.getenv("MCP_BASE_URL")
    if base:
        return f"{base.rstrip('/')}/{label}"
    return f"http://127.0.0.1:{default_port}"


def _mcp_require_approval(label: str) -> str:
    env_var = f"{label.upper()}_MCP_REQUIRE_APPROVAL"
    return os.getenv(env_var, os.getenv("MCP_REQUIRE_APPROVAL_DEFAULT", "always"))

class State(TypedDict):
    feature: dict
    stack: dict
    risk: int
    artifacts: dict

PROMPTS = {}
for name in ["discovery","uxui","spec","plan","front","back","qa","infra","docs","risk_gate"]:
    with open(os.path.join(os.path.dirname(__file__), "..", "prompts", f"{name}.md"), "r", encoding="utf-8") as f:
        PROMPTS[name] = f.read()

# MCP: usa server_url + server_label
_MCP_DEFAULTS = [
    ("repo", 40000),
    ("build", 40001),
    ("test", 40002),
    ("lint", 40003),
    ("pkg", 40004),
    ("design", 40005),
]

MCP_TOOLS = [
    {
        "type": "mcp",
        "server_label": label,
        "server_url": _mcp_server_url(label, port),
        "require_approval": _mcp_require_approval(label),
    }
    for label, port in _MCP_DEFAULTS
]


def call(role: str, state: State):
    r = client.responses.create(
        model=MODEL,
        tools=MCP_TOOLS,
        input=[
            {"role": "system", "content": PROMPTS[role]},
            {"role": "user", "content": json.dumps(state, ensure_ascii=False)}
        ],
    )
    return r.output_text

def Discovery(state: State):
    out = call("discovery", state)
    state.setdefault("artifacts", {})["stack_report.md"] = out
    try:
        detected = json.loads(out.split("```json")[-1].split("```")[0])
        state["stack"] = detected.get("stack", state.get("stack", {}))
    except Exception:
        state.setdefault("stack", state.get("stack", {}))
    return state

def UXUI(state: State):
    out = call("uxui", state); state["artifacts"]["uxui.md"] = out; return state

def Spec(state: State):
    out = call("spec", state); state["artifacts"]["spec.yaml"] = out; return state

def Plan(state: State):
    out = call("plan", state); state["artifacts"]["plan.md"] = out; return state

def Front(state: State):
    out = call("front", state); state["artifacts"]["front_diff.txt"] = out; return state

def Back(state: State):
    out = call("back", state); state["artifacts"]["back_diff.txt"] = out; return state

def QA(state: State):
    out = call("qa", state); state["artifacts"]["qa_report.md"] = out
    state["risk"] = 1 if ("payments" in out.lower() or "migration" in out.lower()) else 0
    return state

def RiskGate(state: State):
    out = call("risk_gate", state); state["artifacts"]["risk.md"] = out; return state

def Infra(state: State):
    out = call("infra", state); state["artifacts"]["infra.md"] = out; return state

def Docs(state: State):
    out = call("docs", state); state["artifacts"]["CHANGELOG.md"] = out; return state

g = StateGraph(State)
for n in [Discovery, UXUI, Spec, Plan, Front, Back, QA, RiskGate, Infra, Docs]:
    g.add_node(n.__name__, n)

g.set_entry_point("Discovery")
g.add_edge("Discovery","UXUI"); g.add_edge("UXUI","Spec"); g.add_edge("Spec","Plan")
g.add_edge("Plan","Front"); g.add_edge("Plan","Back")
g.add_edge("Front","QA");  g.add_edge("Back","QA")
g.add_conditional_edges("QA", lambda s: "RiskGate" if s.get("risk",0)>0 else "Infra",
                        {"RiskGate":"RiskGate","Infra":"Infra"})
g.add_edge("RiskGate","Infra"); g.add_edge("Infra","Docs"); g.add_edge("Docs", END)
app = g.compile()

if __name__ == "__main__":
    payload = {
        "feature": {"title":"Nueva característica agnóstica","user_story":"Como usuario quiero X",
                    "acceptance":["Criterio A","Criterio B"],"constraints":["Ninguna"]},
        "stack": {"frontend":{"lang":"typescript","framework":"react"},
          "backend":{"lang":"python","framework":"fastapi"},}
    }
    final = app.invoke(payload)
    print(json.dumps(final.get("artifacts", {}), indent=2, ensure_ascii=False))
