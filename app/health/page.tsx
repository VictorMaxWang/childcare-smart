"use client";

import { useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Search, Thermometer, Users } from "lucide-react";
import { useApp } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { HEALTH_MOOD_OPTIONS, HAND_MOUTH_EYE_OPTIONS, TEMPERATURE_THRESHOLD } from "@/lib/mock/health";
import { getAgeText } from "@/lib/store";

const TEMPLATE_REMARKS = {
  NORMAL: "体温正常，情绪稳定",
  SLIGHT_COUGH: "轻微咳嗽，需观察",
  LOW_FEVER: "低烧，已通知家长"
};

export default function HealthPage() {
  const { presentChildren, healthCheckRecords, upsertHealthCheck, currentUser } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "abnormal" | "unchecked">("all");
  
  // Dialog State
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [temperature, setTemperature] = useState<string>("36.5");
  const [mood, setMood] = useState<string>(HEALTH_MOOD_OPTIONS[0].label);
  const [handMouthEye, setHandMouthEye] = useState<"正常" | "异常">("正常");
  const [remark, setRemark] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Computed data
  const childData = useMemo(() => {
    return presentChildren.map(child => {
      const todayRecord = healthCheckRecords.find(r => r.childId === child.id && r.date === new Date().toISOString().split("T")[0]);
      return { 
        ...child, 
        health: todayRecord 
      };
    });
  }, [presentChildren, healthCheckRecords]);

  const filteredChildren = useMemo(() => {
    return childData.filter(child => {
      const matchesSearch = child.name.includes(searchTerm) || (child.nickname && child.nickname.includes(searchTerm));
      if (!matchesSearch) return false;
      
      if (filterStatus === "unchecked") return !child.health;
      if (filterStatus === "abnormal") return child.health?.isAbnormal;
      
      return true;
    });
  }, [childData, searchTerm, filterStatus]);

  const stats = useMemo(() => {
    const total = childData.length;
    const checked = childData.filter(c => c.health).length;
    const abnormal = childData.filter(c => c.health?.isAbnormal).length;
    return { total, checked, abnormal, unchecked: total - checked };
  }, [childData]);

  // Actions
  const handleOpenDialog = (childId: string) => {
    const child = childData.find(c => c.id === childId);
    if (!child) return;
    
    if (child.health) {
      setTemperature(String(child.health.temperature));
      setMood(child.health.mood);
      setHandMouthEye(child.health.handMouthEye);
      setRemark(child.health.remark || "");
    } else {
      setTemperature("36.5");
      setMood(HEALTH_MOOD_OPTIONS[0].label);
      setHandMouthEye("正常");
      setRemark(TEMPLATE_REMARKS.NORMAL);
    }
    
    setSelectedChildId(childId);
    setIsDialogOpen(true);
  };

  const handleSaveHealthCheck = () => {
    if (!selectedChildId) return;
    
    const tempNum = parseFloat(temperature);
    const isTempAbnormal = tempNum >= TEMPERATURE_THRESHOLD;
    const isAbnormal = isTempAbnormal || handMouthEye === "异常" || mood.includes("哭闹");

    upsertHealthCheck({
      childId: selectedChildId,
      temperature: tempNum,
      mood,
      handMouthEye,
      isAbnormal,
      remark
    });

    setIsDialogOpen(false);
  };
  
  if (currentUser.role === "家长") {
    return (
      <div className="flex h-[80vh] items-center justify-center text-muted-foreground">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
          <h2 className="text-lg font-semibold">权限不足</h2>
          <p>家长视图无法操作健康晨检页面，请返回主页或家长专属页。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 page-enter">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-800">
            <Thermometer className="h-8 w-8 text-sky-500" />
            晨检与健康
          </h1>
          <p className="text-muted-foreground mt-1">记录并追踪班级幼儿每日健康体征，及时预警异常情况。</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="shadow-sm border-blue-100 bg-blue-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总计出勤</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total} <span className="text-sm font-normal text-muted-foreground">人</span></div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-green-100 bg-green-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已晨检</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.checked} <span className="text-sm font-normal text-muted-foreground">人</span></div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-orange-100 bg-orange-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">待检查</CardTitle>
            <Activity className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.unchecked} <span className="text-sm font-normal text-muted-foreground">人</span></div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-red-100 bg-red-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">异常告警</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.abnormal} <span className="text-sm font-normal text-muted-foreground">人</span></div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="搜索幼儿姓名或乳名..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2 bg-muted p-1 rounded-md">
              <button 
                className={`px-3 py-1 text-sm rounded-sm transition-all ${filterStatus === "all" ? "bg-white shadow-sm font-medium" : "text-muted-foreground hover:bg-white/50"}`}
                onClick={() => setFilterStatus("all")}
              >全部</button>
              <button 
                className={`px-3 py-1 text-sm rounded-sm transition-all ${filterStatus === "unchecked" ? "bg-white shadow-sm font-medium" : "text-muted-foreground hover:bg-white/50"}`}
                onClick={() => setFilterStatus("unchecked")}
              >待晨检</button>
              <button 
                className={`px-3 py-1 text-sm rounded-sm transition-all ${filterStatus === "abnormal" ? "bg-white shadow-sm font-medium" : "text-muted-foreground hover:bg-white/50"}`}
                onClick={() => setFilterStatus("abnormal")}
              >异常警告</button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredChildren.map((child) => {
              const isChecked = !!child.health;
              const isAbnormal = child.health?.isAbnormal;
              
              return (
                <Card 
                  key={child.id} 
                  className={`overflow-hidden transition-all hover:shadow-md cursor-pointer border-l-4 ${!isChecked ? 'border-l-orange-300' : isAbnormal ? 'border-l-red-500 bg-red-50/30' : 'border-l-green-500'}`}
                  onClick={() => handleOpenDialog(child.id)}
                >
                  <div className="p-4 flex gap-4">
                    <div className="h-12 w-12 rounded-full flex items-center justify-center bg-primary/10 text-xl flex-shrink-0">
                      {child.gender === '男' ? '👦' : '👧'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-medium truncate">{child.name}</h3>
                        {isChecked ? (
                          isAbnormal ? (
                            <Badge variant="destructive" className="ml-2">异常</Badge>
                          ) : (
                            <Badge variant="secondary" className="ml-2 bg-green-100 text-green-800 hover:bg-green-100">正常</Badge>
                          )
                        ) : (
                          <Badge variant="outline" className="ml-2 text-orange-600 border-orange-200">待检</Badge>
                        )}
                      </div>
                      
                      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                        <span>{getAgeText(child.birthDate)}</span>
                        <span>•</span>
                        <span>{child.className}</span>
                      </div>
                      
                      {isChecked && (
                        <div className="flex gap-3 text-sm">
                          <div className={`flex items-center gap-1 ${child.health!.temperature >= TEMPERATURE_THRESHOLD ? 'text-red-500 font-medium' : 'text-gray-600'}`}>
                            <Thermometer className="h-3.5 w-3.5" />
                            {child.health!.temperature.toFixed(1)}°C
                          </div>
                          <div className="text-gray-600 truncate border-l pl-3">
                            {child.health!.mood} · {child.health!.handMouthEye}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          
          {filteredChildren.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              未找到符合条件的幼儿
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              晨检记录 - {childData.find((c) => c.id === selectedChildId)?.name}
            </DialogTitle>
            <DialogDescription>
              记录由于今天的体温、情绪以及手口眼初步检查状态。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="temperature" className="text-right">
                体温 (°C)
              </Label>
              <div className="col-span-3">
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className={parseFloat(temperature) >= TEMPERATURE_THRESHOLD ? "border-red-500 text-red-600" : ""}
                />
                {parseFloat(temperature) >= TEMPERATURE_THRESHOLD && (
                  <p className="text-xs text-red-500 mt-1">发热预警 (≥{TEMPERATURE_THRESHOLD}°C)</p>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="handMouthEye" className="text-right">
                手口眼
              </Label>
              <Select value={handMouthEye} onValueChange={(val) => setHandMouthEye(val as "正常" | "异常")}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  {HAND_MOUTH_EYE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="mood" className="text-right">
                情绪状态
              </Label>
              <Select value={mood} onValueChange={setMood}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  {HEALTH_MOOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.label} value={opt.label}>{opt.emoji} {opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="remark" className="text-right mt-2">
                备注说明
              </Label>
              <div className="col-span-3 space-y-2">
                <Textarea
                  id="remark"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="检查补充说明..."
                />
                <div className="flex flex-wrap gap-2">
                  <Badge 
                    variant="outline" 
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => setRemark(TEMPLATE_REMARKS.NORMAL)}
                  >
                    常规正常
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => setRemark(TEMPLATE_REMARKS.SLIGHT_COUGH)}
                  >
                    轻微咳嗽
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => setRemark(TEMPLATE_REMARKS.LOW_FEVER)}
                  >
                    低烧观察
                  </Badge>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveHealthCheck}>
              保存记录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
