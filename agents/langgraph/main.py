import os, json
from typing import TypedDict
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from openai import OpenAI

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = os.getenv("MODEL", "gpt-5-codex")

class State(TypedDict):
    feature: dict           # titulo, user_story, acceptance, constraints
    stack: dict             # inferido o declarado: {frontend:{lang,framework}, backend:{lang,framework}, infra:{cloud}, design:{tool}}
    risk: int
    artifacts: dict

PROMPTS = {}
for name in ["discovery","uxui","spec","plan","front","back","qa","infra","docs","risk_gate"]:
    with open(os.path.join(os.path.dirname(__file__),"..","prompts",f"{name}.md"),"r",encoding="utf-8") as f:
        PROMPTS[name] = f.read()

def call(role: str, state: State, tools=None):
    tools = tools or []
    resp = client.responses.create(
        model=MODEL,
        input=[
            {"role":"system","content":PROMPTS[role]},
            {"role":"user","content":json.dumps(state, ensure_ascii=False)}
        ],
        tools=tools
    )
    return resp.output_text

# ---- Nodes ----

def Discovery(state: State):
    """Detecta o confirma stack. Lee repo si existe, sinon propone opciones y matricula adapters."""
    tools=[{"type":"mcp_tool","name":"repo.scan"}]
    out = call("discovery", state, tools=tools)
    state.setdefault("artifacts",{})["stack_report.md"] = out
    # JSON al final del prompt: {"stack":{...}}
    try:
        detected = json.loads(out.split("```json")[-1].split("```")[-2])
        state["stack"] = detected.get("stack", state.get("stack", {}))
    except Exception:
        state.setdefault("stack", state.get("stack", {}))
    return state


def UXUI(state: State):
    tools=[{"type":"mcp_tool","name":"design.spec"},{"type":"mcp_tool","name":"repo.write"}]
    out = call("uxui", state, tools=tools)
    state["artifacts"]["uxui.md"] = out
    return state


def Spec(state: State):
    tools=[{"type":"mcp_tool","name":"repo.write"}]
    out = call("spec", state, tools=tools)
    state["artifacts"]["spec.yaml"] = out
    return state


def Plan(state: State):
    out = call("plan", state)
    state["artifacts"]["plan.md"] = out
    return state


def Front(state: State):
    tools=[
        {"type":"mcp_tool","name":"pkg.install"},
        {"type":"mcp_tool","name":"build.front"},
        {"type":"mcp_tool","name":"test.front"},
        {"type":"mcp_tool","name":"repo.write"},
        {"type":"mcp_tool","name":"lint.front"}
    ]
    out = call("front", state, tools=tools)
    state["artifacts"]["front_diff.txt"] = out
    return state


def Back(state: State):
    tools=[
        {"type":"mcp_tool","name":"pkg.install"},
        {"type":"mcp_tool","name":"build.back"},
        {"type":"mcp_tool","name":"test.back"},
        {"type":"mcp_tool","name":"repo.write"},
        {"type":"mcp_tool","name":"lint.back"}
    ]
    out = call("back", state, tools=tools)
    state["artifacts"]["back_diff.txt"] = out
    return state


def QA(state: State):
    tools=[{"type":"mcp_tool","name":"test.front"},{"type":"mcp_tool","name":"test.back"},{"type":"mcp_tool","name":"lint.front"},{"type":"mcp_tool","name":"lint.back"}]
    out = call("qa", state, tools=tools)
    state["artifacts"]["qa_report.md"] = out
    state["risk"] = 1 if ("payments" in out.lower() or "migration" in out.lower()) else 0
    return state


def RiskGate(state: State):
    out = call("risk_gate", state)
    state["artifacts"]["risk.md"] = out
    return state


def Infra(state: State):
    tools=[{"type":"mcp_tool","name":"repo.pr"},{"type":"mcp_tool","name":"ci.run"}]
    out = call("infra", state, tools=tools)
    state["artifacts"]["infra.md"] = out
    return state


def Docs(state: State):
    out = call("docs", state)
    state["artifacts"]["CHANGELOG.md"] = out
    return state

# ---- Graph ----
from langgraph.graph import StateGraph

g = StateGraph(State)
for n in [Discovery, UXUI, Spec, Plan, Front, Back, QA, RiskGate, Infra, Docs]:
    g.add_node(n.__name__, n)

g.set_entry_point("Discovery")

g.add_edge("Discovery","UXUI")

g.add_edge("UXUI","Spec")

g.add_edge("Spec","Plan")

g.add_edge("Plan","Front"); g.add_edge("Plan","Back")

g.add_edge("Front","QA"); g.add_edge("Back","QA")

def route_q(a: State):
    return "RiskGate" if a.get("risk",0)>0 else "Infra"

g.add_conditional_edges("QA", route_q, {"RiskGate":"RiskGate","Infra":"Infra"})

g.add_edge("RiskGate","Infra")

g.add_edge("Infra","Docs")

g.add_edge("Docs", END)

app = g.compile()

if __name__ == "__main__":
    payload = {
      "feature": {
        "title":"Nueva característica agnóstica",
        "user_story":"Como usuario quiero X",
        "acceptance":["Criterio A","Criterio B"],
        "constraints":["Ninguna"],
      },
      "stack": {
        # Opcional: si lo dejas vacío, Discovery lo infiere del repo o te propone
        # "frontend": {"lang":"typescript","framework":"react"},
        # "backend": {"lang":"go","framework":"echo"},
        # "infra": {"cloud":"k8s"},
        # "design": {"tool":"figma"}
      }
    }
    final = app.invoke(payload)
    print(json.dumps(final.get("artifacts",{}), indent=2, ensure_ascii=False))