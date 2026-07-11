import { useCallback, useEffect, useRef, useState } from "react";
import { LOTTO_BUCKET, supabase } from "./supabaseClient";
import "./App.css";

const ADMIN_USERNAME = "hoony6837";
const ADMIN_AUTH_EMAIL = "hoony6837@naver.com";

function createId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFileExtension(file) {
  const type = file.type || "";

  if (type.includes("jpeg")) return "jpg";
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";

  return "png";
}

function makeImagePath(round, file) {
  const safeRound = String(round || "미지정").replace(/[^\w가-힣-]/g, "_");
  const extension = getFileExtension(file);

  return `${safeRound}/${Date.now()}-${createId()}.${extension}`;
}

function formatDate(value) {
  if (!value) return "";

  return new Date(value).toLocaleString("ko-KR");
}

function isMobileScreen() {
  return window.matchMedia("(max-width: 768px)").matches;
}

async function removeStorageFiles(paths) {
  const validPaths = paths.filter(Boolean);

  if (validPaths.length === 0) return;

  const chunkSize = 100;

  for (let i = 0; i < validPaths.length; i += chunkSize) {
    const chunk = validPaths.slice(i, i + chunkSize);

    const { error } = await supabase.storage.from(LOTTO_BUCKET).remove(chunk);

    if (error) {
      throw error;
    }
  }
}

const CARD_WIDTH = 286;
const CARD_GAP = 24;
const GRID_X = CARD_WIDTH + CARD_GAP;
const GRID_Y = 330;
const BOARD_PADDING = 24;
const AUTO_SCROLL_EDGE = 90;
const AUTO_SCROLL_SPEED = 22;

export default function App() {
  const [round, setRound] = useState("");
  const [searchRound, setSearchRound] = useState("");
  const [captures, setCaptures] = useState([]);
  const [message, setMessage] = useState(
    "회차를 입력하고 캡처 이미지를 Ctrl + V로 붙여넣으세요."
  );
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCaptureId, setSelectedCaptureId] = useState(null);
  const [previewCaptureId, setPreviewCaptureId] = useState(null);
  const [boardMode, setBoardMode] = useState("locked");

  const [isMemoOpen, setIsMemoOpen] = useState(false);
  const [pageMemo, setPageMemo] = useState("");
  const [lastSavedMemo, setLastSavedMemo] = useState("");
  const [memoSaveStatus, setMemoSaveStatus] = useState("idle");
  const [isMemoLoaded, setIsMemoLoaded] = useState(false);
  const [memoUpdatedAt, setMemoUpdatedAt] = useState("");

  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const [session, setSession] = useState(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewMenuOpen, setIsPreviewMenuOpen] = useState(false);
  const [isPreviewDetailOpen, setIsPreviewDetailOpen] = useState(false);

  const capturesRef = useRef([]);
  const dragRef = useRef(null);
  const boardWrapRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const previewTouchStartXRef = useRef(null);

  const previewCapture =
    captures.find((capture) => capture.id === previewCaptureId) || null;

  const showToast = useCallback((text, type = "info") => {
    if (isMobileScreen()) {
      return;
    }

    const id = createId();

    setToasts((prev) => {
      const next = [...prev, { id, text, type }];
      return next.slice(-4);
    });

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const getBoardColumnCount = useCallback(() => {
    const width = boardWrapRef.current?.clientWidth || 1600;
    return Math.max(1, Math.floor((width - BOARD_PADDING * 2) / GRID_X));
  }, []);

  const getGridPosition = useCallback(
    (index) => {
      const columns = getBoardColumnCount();

      return {
        x: BOARD_PADDING + (index % columns) * GRID_X,
        y: BOARD_PADDING + Math.floor(index / columns) * GRID_Y,
      };
    },
    [getBoardColumnCount]
  );

  const findEmptyPosition = useCallback(
    (items) => {
      const columns = getBoardColumnCount();

      const occupied = new Set(
        items.map((item) => {
          const col = Math.round((item.x - BOARD_PADDING) / GRID_X);
          const row = Math.round((item.y - BOARD_PADDING) / GRID_Y);

          return `${col}-${row}`;
        })
      );

      for (let index = 0; index < 1000; index += 1) {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const key = `${col}-${row}`;

        if (!occupied.has(key)) {
          return {
            x: BOARD_PADDING + col * GRID_X,
            y: BOARD_PADDING + row * GRID_Y,
          };
        }
      }

      return getGridPosition(items.length);
    },
    [getBoardColumnCount, getGridPosition]
  );

  const findNearestFreePosition = useCallback(
    (targetId, x, y) => {
      const columns = getBoardColumnCount();

      const occupied = new Set(
        capturesRef.current
          .filter((item) => item.id !== targetId)
          .map((item) => {
            const col = Math.round((item.x - BOARD_PADDING) / GRID_X);
            const row = Math.round((item.y - BOARD_PADDING) / GRID_Y);

            return `${col}-${row}`;
          })
      );

      const startCol = Math.max(0, Math.round((x - BOARD_PADDING) / GRID_X));
      const startRow = Math.max(0, Math.round((y - BOARD_PADDING) / GRID_Y));

      for (let radius = 0; radius < 80; radius += 1) {
        const minRow = Math.max(0, startRow - radius);
        const maxRow = startRow + radius;
        const minCol = Math.max(0, startCol - radius);
        const maxCol = Math.min(columns - 1, startCol + radius);

        for (let row = minRow; row <= maxRow; row += 1) {
          for (let col = minCol; col <= maxCol; col += 1) {
            const key = `${col}-${row}`;

            if (!occupied.has(key)) {
              return {
                x: BOARD_PADDING + col * GRID_X,
                y: BOARD_PADDING + row * GRID_Y,
              };
            }
          }
        }
      }

      return {
        x: BOARD_PADDING,
        y: BOARD_PADDING,
      };
    },
    [getBoardColumnCount]
  );

  const getSlotFromPosition = useCallback(
    (x, y) => {
      const columns = getBoardColumnCount();

      const col = Math.min(
        columns - 1,
        Math.max(0, Math.round((x - BOARD_PADDING) / GRID_X))
      );

      const row = Math.max(0, Math.round((y - BOARD_PADDING) / GRID_Y));

      return {
        col,
        row,
        key: `${col}-${row}`,
        x: BOARD_PADDING + col * GRID_X,
        y: BOARD_PADDING + row * GRID_Y,
      };
    },
    [getBoardColumnCount]
  );

  const handleToggleBoardMode = () => {
    if (!requireAdmin("관리자 로그인 후 위치를 수정할 수 있습니다.")) return;

    const next = boardMode === "editing" ? "locked" : "editing";

    setBoardMode(next);

    if (next === "editing") {
      setMessage("수정 상태입니다. 카드 상단을 잡고 위치를 이동할 수 있습니다.");
      showToast("수정 상태로 변경되었습니다.", "info");
    } else {
      dragRef.current = null;
      setMessage("저장 상태입니다. 카드 위치 이동이 잠겼습니다.");
      showToast("저장 상태로 변경되었습니다.", "success");
    }
  };

  useEffect(() => {
    capturesRef.current = captures;
  }, [captures]);

  const loadCaptures = useCallback(async () => {
    try {
      setIsLoading(true);

      const { data, error } = await supabase
        .from("lotto_captures")
        .select("*")
        .order("z_index", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      const formatted = (data || []).map((item) => ({
        id: item.id,
        round: item.round,
        imagePath: item.image_path,
        imageUrl: item.image_url,
        x: item.x,
        y: item.y,
        zIndex: item.z_index,
        memo: item.memo || "",
        createdAt: item.created_at,
      }));

      setCaptures(formatted);

      setSelectedCaptureId((prev) => {
        if (prev && formatted.some((item) => item.id === prev)) {
          return prev;
        }

        return formatted[0]?.id || null;
      });

      setMessage("Supabase에서 데이터를 불러왔습니다.");
    } catch (error) {
      console.error(error);
      setMessage("Supabase 데이터를 불러오지 못했습니다.");
      showToast("Supabase 데이터를 불러오지 못했습니다.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const loadPageMemo = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("lotto_page_notes")
        .select("*")
        .eq("id", "main")
        .maybeSingle();

      if (error) {
        throw error;
      }

      const content = data?.content || "";

      setPageMemo(content);
      setLastSavedMemo(content);
      setMemoUpdatedAt(data?.updated_at || "");
      setMemoSaveStatus("idle");
      setIsMemoLoaded(true);
    } catch (error) {
      console.error(error);
      setIsMemoLoaded(true);
      setMemoSaveStatus("error");
      showToast("메모장을 불러오지 못했습니다.", "error");
    }
  }, [showToast]);


  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);

      if (!nextSession) {
        setBoardMode("locked");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const requireAdmin = useCallback(
    (text = "관리자 로그인 후 사용할 수 있습니다.") => {
      if (session) return true;

      setMessage(text);
      setLoginMessage("");
      setIsLoginOpen(true);
      return false;
    },
    [session]
  );

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginMessage("");

    if (loginUsername.trim() !== ADMIN_USERNAME) {
      setLoginMessage("아이디 또는 비밀번호가 올바르지 않습니다.");
      return;
    }

    setIsLoggingIn(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: ADMIN_AUTH_EMAIL,
      password: loginPassword,
    });

    setIsLoggingIn(false);

    if (error) {
      setLoginMessage(
        "로그인에 실패했습니다. Supabase Authentication에 관리자 계정을 먼저 만들어야 합니다."
      );
      return;
    }

    setLoginPassword("");
    setIsLoginOpen(false);
    setMessage("관리자 계정으로 로그인했습니다.");
    showToast("관리자 로그인이 완료되었습니다.", "success");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMessage("로그아웃되었습니다. 사진은 조회만 할 수 있습니다.");
  };

  useEffect(() => {
    loadCaptures();
    loadPageMemo();
  }, [loadCaptures, loadPageMemo]);

  useEffect(() => {
    if (!isMemoLoaded || !session) return;

    if (pageMemo === lastSavedMemo) {
      return;
    }

    setMemoSaveStatus("saving");

    const timer = window.setTimeout(async () => {
      try {
        const now = new Date().toISOString();

        const { error } = await supabase.from("lotto_page_notes").upsert(
          {
            id: "main",
            content: pageMemo,
            updated_at: now,
          },
          {
            onConflict: "id",
          }
        );

        if (error) {
          throw error;
        }

        setLastSavedMemo(pageMemo);
        setMemoUpdatedAt(now);
        setMemoSaveStatus("saved");
      } catch (error) {
        console.error(error);
        setMemoSaveStatus("error");
        showToast("메모 저장 중 오류가 발생했습니다.", "error");
      }
    }, 800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [pageMemo, lastSavedMemo, isMemoLoaded, showToast, session]);

  const addImageCapture = useCallback(
    async (file) => {
      if (!session) {
        throw new Error("관리자 로그인 후 사진을 추가할 수 있습니다.");
      }

      const safeRound = round.trim() || "미지정";
      const maxZIndex = capturesRef.current.reduce((max, item) => {
        return Math.max(max, item.zIndex || 1);
      }, 1);

      const emptyPosition = findEmptyPosition(capturesRef.current);
      const imagePath = makeImagePath(safeRound, file);

      const { error: uploadError } = await supabase.storage
        .from(LOTTO_BUCKET)
        .upload(imagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "image/png",
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from(LOTTO_BUCKET)
        .getPublicUrl(imagePath);

      const imageUrl = publicUrlData.publicUrl;

      const newCapture = {
        round: safeRound,
        image_path: imagePath,
        image_url: imageUrl,
        x: emptyPosition.x,
        y: emptyPosition.y,
        z_index: maxZIndex + 1,
      };

      const { data, error: insertError } = await supabase
        .from("lotto_captures")
        .insert(newCapture)
        .select()
        .single();

      if (insertError) {
        await supabase.storage.from(LOTTO_BUCKET).remove([imagePath]);
        throw insertError;
      }

      const formatted = {
        id: data.id,
        round: data.round,
        imagePath: data.image_path,
        imageUrl: data.image_url,
        x: data.x,
        y: data.y,
        zIndex: data.z_index,
        memo: data.memo || "",
        createdAt: data.created_at,
      };

      setCaptures((prev) => [...prev, formatted]);
      setSelectedCaptureId(formatted.id);
      setMessage(`${safeRound}회차 캡처가 Supabase에 저장되었습니다.`);
      showToast(`${safeRound}회차 캡처가 저장되었습니다.`, "success");
    },
    [round, showToast, findEmptyPosition, session]
  );

  const handlePaste = useCallback(
    async (event) => {
      const items = event.clipboardData?.items;

      if (!items || items.length === 0) return;

      const imageItems = Array.from(items).filter((item) => {
        return item.type.startsWith("image/");
      });

      if (imageItems.length === 0) return;

      event.preventDefault();

      if (!requireAdmin("관리자 로그인 후 Ctrl + V로 캡처를 저장할 수 있습니다.")) {
        return;
      }

      try {
        for (const item of imageItems) {
          const file = item.getAsFile();

          if (file) {
            await addImageCapture(file);
          }
        }
      } catch (error) {
        console.error(error);
        setMessage("이미지를 Supabase에 저장하는 중 오류가 발생했습니다.");
        showToast("이미지를 저장하지 못했습니다.", "error");
      }
    },
    [addImageCapture, showToast, requireAdmin]
  );


  const handleFileUpload = useCallback(
    async (fileList) => {
      if (!requireAdmin("관리자 로그인 후 사진을 추가할 수 있습니다.")) {
        return;
      }

      const files = Array.from(fileList || []).filter((file) =>
        file.type.startsWith("image/")
      );

      if (files.length === 0) return;

      try {
        setIsUploading(true);

        for (const file of files) {
          await addImageCapture(file);
        }

        setMessage(`${files.length}개 이미지를 저장했습니다.`);
      } catch (error) {
        console.error(error);
        setMessage(error.message || "이미지를 저장하지 못했습니다.");
        showToast("이미지를 저장하지 못했습니다.", "error");
      } finally {
        setIsUploading(false);

        if (fileInputRef.current) fileInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
      }
    },
    [addImageCapture, requireAdmin, showToast]
  );

  useEffect(() => {
    window.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [handlePaste]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!dragRef.current) return;

      const boardEl = boardWrapRef.current;

      if (boardEl) {
        const rect = boardEl.getBoundingClientRect();

        if (event.clientX > rect.right - AUTO_SCROLL_EDGE) {
          boardEl.scrollLeft += AUTO_SCROLL_SPEED;
        }

        if (event.clientX < rect.left + AUTO_SCROLL_EDGE) {
          boardEl.scrollLeft -= AUTO_SCROLL_SPEED;
        }

        if (event.clientY > rect.bottom - AUTO_SCROLL_EDGE) {
          boardEl.scrollTop += AUTO_SCROLL_SPEED;
        }

        if (event.clientY < rect.top + AUTO_SCROLL_EDGE) {
          boardEl.scrollTop -= AUTO_SCROLL_SPEED;
        }
      }

      const {
        id,
        startX,
        startY,
        originalX,
        originalY,
        startScrollLeft,
        startScrollTop,
      } = dragRef.current;

      const scrollLeftDiff = boardEl ? boardEl.scrollLeft - startScrollLeft : 0;
      const scrollTopDiff = boardEl ? boardEl.scrollTop - startScrollTop : 0;

      const nextX = Math.max(
        0,
        originalX + event.clientX - startX + scrollLeftDiff
      );

      const nextY = Math.max(
        0,
        originalY + event.clientY - startY + scrollTopDiff
      );

      dragRef.current.lastX = nextX;
      dragRef.current.lastY = nextY;

      setCaptures((prev) =>
        prev.map((capture) =>
          capture.id === id
            ? {
                ...capture,
                x: nextX,
                y: nextY,
              }
            : capture
        )
      );
    };

    const handlePointerUp = async () => {
      if (!dragRef.current) return;

      const { id, zIndex, lastX, lastY, originalX, originalY } =
        dragRef.current;

      dragRef.current = null;

      const latest = capturesRef.current.find((capture) => capture.id === id);

      if (!latest) return;

      const targetX = typeof lastX === "number" ? lastX : latest.x;
      const targetY = typeof lastY === "number" ? lastY : latest.y;

      const targetSlot = getSlotFromPosition(targetX, targetY);
      const sourceSlot = getSlotFromPosition(originalX, originalY);

      const swapTarget = capturesRef.current.find((capture) => {
        if (capture.id === id) return false;

        const captureSlot = getSlotFromPosition(capture.x, capture.y);

        return captureSlot.key === targetSlot.key;
      });

      let updates = [];

      if (swapTarget) {
        updates = [
          {
            id,
            x: swapTarget.x,
            y: swapTarget.y,
            zIndex,
          },
          {
            id: swapTarget.id,
            x: sourceSlot.x,
            y: sourceSlot.y,
            zIndex: swapTarget.zIndex || 1,
          },
        ];
      } else {
        const snappedPosition = findNearestFreePosition(id, targetX, targetY);

        updates = [
          {
            id,
            x: snappedPosition.x,
            y: snappedPosition.y,
            zIndex,
          },
        ];
      }

      setCaptures((prev) =>
        prev.map((capture) => {
          const update = updates.find((item) => item.id === capture.id);

          if (!update) return capture;

          return {
            ...capture,
            x: update.x,
            y: update.y,
            zIndex: update.zIndex,
          };
        })
      );

      try {
        for (const update of updates) {
          const { error } = await supabase
            .from("lotto_captures")
            .update({
              x: update.x,
              y: update.y,
              z_index: update.zIndex,
            })
            .eq("id", update.id);

          if (error) {
            throw error;
          }
        }

        if (swapTarget) {
          setMessage("카드 위치가 서로 바뀌고 Supabase에 저장되었습니다.");
          showToast("카드 위치가 서로 바뀌었습니다.", "success");
        } else {
          setMessage("위치가 Supabase에 저장되었습니다.");
          showToast("위치가 저장되었습니다.", "success");
        }
      } catch (error) {
        console.error(error);
        setMessage("위치 저장 중 오류가 발생했습니다.");
        showToast("위치를 저장하지 못했습니다.", "error");
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [showToast, findNearestFreePosition, getSlotFromPosition]);

  const startDrag = (event, capture) => {
    if (event.button !== 0) return;
    if (!requireAdmin("관리자 로그인 후 카드 위치를 수정할 수 있습니다.")) return;

    setSelectedCaptureId(capture.id);

    if (boardMode !== "editing") {
      showToast("수정 상태에서만 위치를 이동할 수 있습니다.", "info");
      setMessage("저장 상태에서는 카드 위치 이동이 잠겨 있습니다.");
      return;
    }

    const maxZIndex = capturesRef.current.reduce((max, item) => {
      return Math.max(max, item.zIndex || 1);
    }, 1);

    const nextZIndex = maxZIndex + 1;
    const boardEl = boardWrapRef.current;

    dragRef.current = {
      id: capture.id,
      startX: event.clientX,
      startY: event.clientY,
      originalX: capture.x,
      originalY: capture.y,
      lastX: capture.x,
      lastY: capture.y,
      startScrollLeft: boardEl?.scrollLeft || 0,
      startScrollTop: boardEl?.scrollTop || 0,
      zIndex: nextZIndex,
    };

    event.preventDefault();

    setCaptures((prev) =>
      prev.map((item) =>
        item.id === capture.id
          ? {
              ...item,
              zIndex: nextZIndex,
            }
          : item
      )
    );
  };

  const openDeleteConfirm = (capture) => {
    if (!requireAdmin("관리자 로그인 후 사진을 삭제할 수 있습니다.")) return;

    setConfirmDialog({
      title: "캡처를 삭제할까요?",
      description: `${capture.round}회차 캡처가 삭제됩니다. 웹페이지 메모장은 삭제되지 않습니다.`,
      confirmText: "삭제하기",
      cancelText: "취소",
      mode: "danger",
      onConfirm: async () => {
        const { error: dbError } = await supabase
          .from("lotto_captures")
          .delete()
          .eq("id", capture.id);

        if (dbError) {
          throw dbError;
        }

        await removeStorageFiles([capture.imagePath]);

        const nextCaptures = capturesRef.current.filter(
          (item) => item.id !== capture.id
        );

        setCaptures(nextCaptures);

        setSelectedCaptureId((prev) => {
          if (prev !== capture.id) return prev;

          return nextCaptures[0]?.id || null;
        });

        if (previewCaptureId === capture.id) {
          setPreviewCaptureId(null);
        }

        setMessage("캡처가 삭제되었습니다.");
        showToast("캡처가 삭제되었습니다.", "success");
      },
    });
  };

  const openClearAllConfirm = () => {
    if (!requireAdmin("관리자 로그인 후 전체 삭제를 사용할 수 있습니다.")) return;

    setConfirmDialog({
      title: "전체 캡처를 모두 삭제할까요?",
      description:
        "저장된 모든 캡처 이미지만 삭제됩니다. 메모장은 삭제되지 않습니다.",
      confirmText: "전체 삭제",
      cancelText: "취소",
      mode: "danger",
      onConfirm: async () => {
        const paths = capturesRef.current.map((capture) => capture.imagePath);

        const { error: dbError } = await supabase
          .from("lotto_captures")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");

        if (dbError) {
          throw dbError;
        }

        await removeStorageFiles(paths);

        setCaptures([]);
        setSelectedCaptureId(null);
        setPreviewCaptureId(null);
        setMessage("전체 캡처가 삭제되었습니다.");
        showToast("전체 캡처가 삭제되었습니다.", "success");
      },
    });
  };

  const openClearMemoConfirm = () => {
    if (!requireAdmin("관리자 로그인 후 메모를 비울 수 있습니다.")) return;

    setConfirmDialog({
      title: "메모장을 비울까요?",
      description:
        "메모장 내용만 삭제됩니다. 캡처 이미지는 삭제되지 않습니다.",
      confirmText: "메모 비우기",
      cancelText: "취소",
      mode: "danger",
      onConfirm: async () => {
        const now = new Date().toISOString();

        const { error } = await supabase.from("lotto_page_notes").upsert(
          {
            id: "main",
            content: "",
            updated_at: now,
          },
          {
            onConflict: "id",
          }
        );

        if (error) {
          throw error;
        }

        setPageMemo("");
        setLastSavedMemo("");
        setMemoUpdatedAt(now);
        setMemoSaveStatus("saved");
        showToast("메모장이 비워졌습니다.", "success");
      },
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmDialog?.onConfirm) return;

    try {
      setIsConfirming(true);
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } catch (error) {
      console.error(error);
      setMessage("작업 처리 중 오류가 발생했습니다.");
      showToast("작업 처리 중 오류가 발생했습니다.", "error");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleAutoArrange = async () => {
    if (!requireAdmin("관리자 로그인 후 자동 정렬을 사용할 수 있습니다.")) return;

    if (boardMode !== "editing") {
      showToast("수정 상태에서만 자동 정렬할 수 있습니다.", "info");
      setMessage("저장 상태에서는 자동 정렬이 잠겨 있습니다.");
      return;
    }

    const arranged = captures.map((capture, index) => {
      const position = getGridPosition(index);

      return {
        ...capture,
        x: position.x,
        y: position.y,
        zIndex: index + 1,
      };
    });

    try {
      for (const capture of arranged) {
        const { error } = await supabase
          .from("lotto_captures")
          .update({
            x: capture.x,
            y: capture.y,
            z_index: capture.zIndex,
          })
          .eq("id", capture.id);

        if (error) {
          throw error;
        }
      }

      setCaptures(arranged);
      setMessage("자동 정렬되었습니다.");
      showToast("자동 정렬되었습니다.", "success");
    } catch (error) {
      console.error(error);
      setMessage("자동 정렬 중 오류가 발생했습니다.");
      showToast("자동 정렬 중 오류가 발생했습니다.", "error");
    }
  };

  const filteredCaptures = captures.filter((capture) => {
    const keyword = searchRound.trim();

    if (!keyword) return true;

    return String(capture.round).includes(keyword);
  });


  const movePreview = useCallback(
    (direction) => {
      if (!filteredCaptures.length || !previewCaptureId) return;

      const currentIndex = filteredCaptures.findIndex(
        (capture) => capture.id === previewCaptureId
      );

      if (currentIndex < 0) return;

      const nextIndex =
        (currentIndex + direction + filteredCaptures.length) %
        filteredCaptures.length;

      setPreviewCaptureId(filteredCaptures[nextIndex].id);
      setIsPreviewMenuOpen(false);
      setIsPreviewDetailOpen(false);
    },
    [filteredCaptures, previewCaptureId]
  );

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setPreviewCaptureId(null);
        setConfirmDialog(null);
        setIsMemoOpen(false);
        setIsLoginOpen(false);
        setIsPreviewMenuOpen(false);
        setIsPreviewDetailOpen(false);
      }

      if (previewCaptureId && event.key === "ArrowLeft") {
        movePreview(-1);
      }

      if (previewCaptureId && event.key === "ArrowRight") {
        movePreview(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewCaptureId, movePreview]);

  const handlePreviewTouchEnd = (event) => {
    const startX = previewTouchStartXRef.current;
    const endX = event.changedTouches[0]?.clientX;

    previewTouchStartXRef.current = null;

    if (typeof startX !== "number" || typeof endX !== "number") return;

    const difference = endX - startX;

    if (Math.abs(difference) < 55) return;

    movePreview(difference > 0 ? -1 : 1);
  };

  const totalCount = captures.length;
  const shownCount = filteredCaptures.length;

  return (
    <div className="app">
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="memo-floating-button"
        onClick={() => setIsMemoOpen(true)}
      >
        <span>메모장</span>
      </button>

      <header className="top-header">
        <div>
          <p className="eyebrow">Lotto Capture Board</p>
          <h1>로또 캡처 저장판</h1>
          <p className="description">
            회차를 입력하고 캡처 이미지를 붙여넣으면 Supabase에 자동 저장됩니다.
          </p>

          <div className="page-links">
            <a href={`${import.meta.env.BASE_URL}lotto-table/index.html`}>
              표로 가기
            </a>
            
          </div>
        </div>

        <div className="header-side">
          <div className="auth-box">
            {session ? (
              <>
                <span>관리자 로그인됨</span>
                <a className="admin-page-link" href="#/admin">
                  관리자 페이지
                </a>
                <button type="button" onClick={handleLogout}>
                  로그아웃
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setIsLoginOpen(true)}>
                로그인
              </button>
            )}
          </div>

          <div className="summary-box">
            <span>전체 저장</span>
            <strong>{totalCount}</strong>
          </div>
        </div>
      </header>

      <section className="control-panel">
        <div className="input-group">
          <label>저장할 회차</label>
          <input
            value={round}
            onChange={(event) => setRound(event.target.value)}
            placeholder="예: 1153"
          />
        </div>

        <div className="input-group">
          <label>회차 검색</label>
          <input
            value={searchRound}
            onChange={(event) => setSearchRound(event.target.value)}
            placeholder="예: 1153"
          />
        </div>

        <input
          ref={fileInputRef}
          className="hidden-file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          onChange={(event) => handleFileUpload(event.target.files)}
        />

        <input
          ref={cameraInputRef}
          className="hidden-file-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => handleFileUpload(event.target.files)}
        />

        <button
          type="button"
          className="upload-btn"
          onClick={() => {
            if (requireAdmin()) fileInputRef.current?.click();
          }}
          disabled={isUploading}
        >
          {isUploading ? "업로드 중" : "사진 선택"}
        </button>

        <button
          type="button"
          className="camera-btn"
          onClick={() => {
            if (requireAdmin()) cameraInputRef.current?.click();
          }}
          disabled={isUploading}
        >
          카메라 촬영
        </button>

        <button
          type="button"
          className="primary-btn"
          onClick={handleAutoArrange}
          disabled={!session || boardMode !== "editing"}
        >
          자동 정렬
        </button>

        <button
          type="button"
          className="danger-btn"
          onClick={openClearAllConfirm}
          disabled={!session}
        >
          전체 삭제
        </button>

        <button
          type="button"
          className={`mode-toggle mode-toggle-${boardMode}`}
          onClick={handleToggleBoardMode}
          disabled={!session}
        >
          <span>현재 상태</span>
          <strong>{boardMode === "editing" ? "수정 상태" : "저장 상태"}</strong>
          <em>{boardMode === "editing" ? "드래그 가능" : "이동 잠금"}</em>
        </button>
      </section>

      <section className="paste-guide status-only">
        <div className="status-message">{message}</div>
      </section>

      <section className="workspace">
        <main className="board-wrap" ref={boardWrapRef}>
          <div className="board">
            {isLoading && <div className="empty-box">불러오는 중입니다.</div>}

            {!isLoading && filteredCaptures.length === 0 && (
              <div className="empty-box">
                저장된 캡처가 없습니다. 회차를 입력하고 이미지를 붙여넣으세요.
              </div>
            )}

            {!isLoading &&
              filteredCaptures.map((capture) => (
                <article
                  key={capture.id}
                  className={`capture-card ${
                    selectedCaptureId === capture.id ? "is-selected" : ""
                  } ${boardMode === "editing" ? "is-editing" : "is-locked"}`}
                  style={{
                    transform: `translate(${capture.x}px, ${capture.y}px)`,
                    zIndex: capture.zIndex || 1,
                  }}
                  onClick={() => setSelectedCaptureId(capture.id)}
                >
                  <div
                    className="capture-card-header"
                    onPointerDown={(event) => startDrag(event, capture)}
                  >
                    <div>
                      <strong>{capture.round}회차</strong>
                      <span>{formatDate(capture.createdAt)}</span>
                    </div>

                    {session && (
                      <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          openDeleteConfirm(capture);
                        }}
                        aria-label="삭제"
                      >
                        삭제
                      </button>
                    )}
                  </div>

                  <div className="capture-image-box">
                    <img
                      src={capture.imageUrl}
                      alt={`${capture.round}회차 캡처`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedCaptureId(capture.id);
                        setPreviewCaptureId(capture.id);
                      }}
                    />
                  </div>
                </article>
              ))}
          </div>
        </main>
      </section>

      {isMemoOpen && (
        <div className="memo-modal-overlay" onClick={() => setIsMemoOpen(false)}>
          <section
            className="memo-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="memo-modal-header">
              <div>
                <p className="memo-eyebrow">Page Memo</p>
                <h2>전체 메모장</h2>
              </div>

              <div className="memo-modal-header-right">
                <span className={`memo-status memo-status-${memoSaveStatus}`}>
                  {memoSaveStatus === "saving" && "저장 중"}
                  {memoSaveStatus === "saved" && "저장 완료"}
                  {memoSaveStatus === "error" && "저장 실패"}
                  {memoSaveStatus === "idle" && "대기"}
                </span>

                <button
                  type="button"
                  className="memo-close-btn"
                  onClick={() => setIsMemoOpen(false)}
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="memo-info-box">
              <strong>공용 메모</strong>
              <span>
                {memoUpdatedAt
                  ? `마지막 저장: ${formatDate(memoUpdatedAt)}`
                  : "아직 저장 기록이 없습니다."}
              </span>
            </div>

            <textarea
              value={pageMemo}
              onChange={(event) => setPageMemo(event.target.value)}
              readOnly={!session}
              placeholder={
                session
                  ? "여기에 자유롭게 메모하세요. 입력 후 잠시 멈추면 Supabase에 자동 저장됩니다."
                  : "관리자 로그인 후 메모를 수정할 수 있습니다."
              }
            />

            <div className="memo-modal-footer">
              <p>
                메모장은 캡처 카드와 별개로 저장됩니다. 캡처를 삭제해도 메모장은 유지됩니다.
              </p>

              {session && (
                <button type="button" onClick={openClearMemoConfirm}>
                  메모 비우기
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {previewCapture && (
        <div className="preview-overlay" onClick={() => setPreviewCaptureId(null)}>
          <div
            className="preview-modal enhanced-preview"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="preview-header">
              <div>
                <strong>{previewCapture.round}회차</strong>
                <span>
                  {filteredCaptures.findIndex(
                    (capture) => capture.id === previewCapture.id
                  ) + 1}
                  {" / "}
                  {filteredCaptures.length}
                </span>
              </div>

              <div className="preview-header-actions">
                <div className="preview-menu-wrap">
                  <button
                    type="button"
                    className="preview-more-btn"
                    onClick={() =>
                      setIsPreviewMenuOpen((previous) => !previous)
                    }
                    aria-label="더보기"
                  >
                    ⋮
                  </button>

                  {isPreviewMenuOpen && (
                    <div className="preview-menu">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPreviewDetailOpen(true);
                          setIsPreviewMenuOpen(false);
                        }}
                      >
                        상세
                      </button>
                    </div>
                  )}
                </div>

                <button type="button" onClick={() => setPreviewCaptureId(null)}>
                  닫기
                </button>
              </div>
            </div>

            <button
              type="button"
              className="preview-nav preview-nav-left"
              onClick={() => movePreview(-1)}
              aria-label="이전 사진"
            >
              ‹
            </button>

            <div
              className="preview-image-box"
              onTouchStart={(event) => {
                previewTouchStartXRef.current =
                  event.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={handlePreviewTouchEnd}
            >
              <img
                src={previewCapture.imageUrl}
                alt={`${previewCapture.round}회차 확대 이미지`}
              />
            </div>

            <button
              type="button"
              className="preview-nav preview-nav-right"
              onClick={() => movePreview(1)}
              aria-label="다음 사진"
            >
              ›
            </button>

            {isPreviewDetailOpen && (
              <div
                className="preview-detail-overlay"
                onClick={() => setIsPreviewDetailOpen(false)}
              >
                <section
                  className="preview-detail-card"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="preview-detail-header">
                    <h3>상세 정보</h3>
                    <button
                      type="button"
                      onClick={() => setIsPreviewDetailOpen(false)}
                    >
                      ×
                    </button>
                  </div>

                  <dl>
                    <div>
                      <dt>회차</dt>
                      <dd>{previewCapture.round}회차</dd>
                    </div>
                    <div>
                      <dt>등록 날짜</dt>
                      <dd>{formatDate(previewCapture.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>사진 메모</dt>
                      <dd>{previewCapture.memo || "등록된 메모가 없습니다."}</dd>
                    </div>
                  </dl>
                </section>
              </div>
            )}
          </div>
        </div>
      )}


      {isLoginOpen && (
        <div className="login-overlay" onClick={() => setIsLoginOpen(false)}>
          <form
            className="login-modal"
            onSubmit={handleLogin}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="login-modal-header">
              <div>
                <p className="memo-eyebrow">Admin Login</p>
                <h2>관리자 로그인</h2>
              </div>

              <button
                type="button"
                onClick={() => setIsLoginOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <label>
              아이디
              <input
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label>
              비밀번호
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {loginMessage && <p className="login-error">{loginMessage}</p>}

            <button
              type="submit"
              className="login-submit-btn"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? "로그인 중" : "로그인"}
            </button>
          </form>
        </div>
      )}

      {confirmDialog && (
        <div className="dialog-overlay" onClick={() => setConfirmDialog(null)}>
          <div
            className="dialog-box"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`dialog-icon dialog-icon-${confirmDialog.mode}`}>
              !
            </div>

            <h3>{confirmDialog.title}</h3>
            <p>{confirmDialog.description}</p>

            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-cancel-btn"
                onClick={() => setConfirmDialog(null)}
                disabled={isConfirming}
              >
                {confirmDialog.cancelText || "취소"}
              </button>

              <button
                type="button"
                className={`dialog-confirm-btn dialog-confirm-${confirmDialog.mode}`}
                onClick={handleConfirmAction}
                disabled={isConfirming}
              >
                {isConfirming ? "처리 중" : confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="bottom-info">
        현재 화면 표시: {shownCount}개 / 전체 저장: {totalCount}개
      </footer>
    </div>
  );
}