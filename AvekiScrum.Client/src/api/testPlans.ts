import { apiFetch, describeFailure } from "../lib/apiFetch";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";
const root = `${API_BASE_URL}/api/test-plans`;

export interface Ref { id: number; name: string }
export interface TestPlan { id: number; name: string; description?: string; state: string; areaPath: string; iteration: string; revision: number; rootSuite?: Ref }
export interface TestSuite { id: number; name: string; suiteType: string; revision: number; parentSuite?: Ref; hasChildren: boolean; children: TestSuite[] }
export interface SuiteCase { id: number; name: string; configurations: Ref[]; testers: Ref[] }
export interface TestStep { id: number; actionHtml: string; expectedHtml: string }
export interface TestCase { id: number; revision: number; title: string; state: string; areaPath: string; iterationPath: string; priority: number; assignedTo?: string; steps: TestStep[]; webUrl?: string }
export interface ExecutionStep { actionPath: string; stepIdentifier: string; actionHtml: string; expectedHtml: string; sharedStepTitle?: string }
export interface ExecutionCase { testCase: TestCase; steps: ExecutionStep[]; warning?: string }
export interface TestPoint { id: number; testCase: Ref; configuration: Ref; outcome: string; state: string; tester?: string; lastRunId?: number; lastResultId?: number }
export interface TestRun { id: number; name: string; state: string; startedDate?: string; completedDate?: string; webUrl?: string }
export interface ActionResult { actionPath: string; stepIdentifier: string; outcome: string; comment?: string }
export interface TestResult { id: number; outcome: string; state: string; comment?: string; testCaseId?: number; testPointId?: number; testCaseRevision?: number; completedDate?: string; tester?: string; actionResults: ActionResult[] }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  if (!response.ok) throw new Error(await describeFailure(response, "Azure Test Plans-anropet misslyckades"));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const getPlans = (signal?: AbortSignal) => request<TestPlan[]>(`${root}/`, { signal });
export const createPlan = (body: { name: string; areaPath: string; iteration: string; description?: string }) => request<TestPlan>(`${root}/`, json("POST", body));
export const getSuites = (planId: number, signal?: AbortSignal) => request<TestSuite[]>(`${root}/${planId}/suites`, { signal });
export const createSuite = (planId: number, body: { name: string; parentSuiteId: number }) => request<TestSuite>(`${root}/${planId}/suites`, json("POST", body));
export const getSuiteCases = (planId: number, suiteId: number, signal?: AbortSignal) => request<SuiteCase[]>(`${root}/${planId}/suites/${suiteId}/cases`, { signal });
export const getCase = (caseId: number) => request<TestCase>(`${root}/cases/${caseId}`);
export const getCases = (caseIds: number[], signal?: AbortSignal) => request<TestCase[]>(`${root}/cases/batch`, { ...json("POST", caseIds), signal });
export const getExecutionCase = (caseId: number, revision?: number) => request<ExecutionCase>(`${root}/cases/${caseId}/execution${revision ? `?revision=${revision}` : ""}`);
export const saveCase = (caseId: number | null, body: Omit<TestCase, "id" | "webUrl">) => request<TestCase>(caseId ? `${root}/cases/${caseId}` : `${root}/cases`, json(caseId ? "PATCH" : "POST", body));
export const addCase = (planId: number, suiteId: number, caseId: number) => request<void>(`${root}/${planId}/suites/${suiteId}/cases`, json("POST", { caseIds: [caseId] }));
export const removeCase = (planId: number, suiteId: number, caseId: number) => request<void>(`${root}/${planId}/suites/${suiteId}/cases/${caseId}`, { method: "DELETE" });
export const getPoints = (planId: number, suiteId: number, signal?: AbortSignal) => request<TestPoint[]>(`${root}/${planId}/suites/${suiteId}/points`, { signal });
export const createRun = (body: { name: string; planId: number; pointIds: number[]; comment?: string }) => request<TestRun>(`${root}/runs`, json("POST", body));
export const getRun = (runId: number) => request<TestRun>(`${root}/runs/${runId}`);
export const getResults = (runId: number) => request<TestResult[]>(`${root}/runs/${runId}/results`);
export const updateResults = (runId: number, body: Array<{ id: number; outcome: string; state: string; comment?: string; actionResults?: Array<{ actionPath: string; stepIdentifier: string; outcome: string; comment?: string }> }>) => request<void>(`${root}/runs/${runId}/results`, json("PATCH", body));
export const completeRun = (runId: number) => request<TestRun>(`${root}/runs/${runId}/complete`, { method: "POST" });
